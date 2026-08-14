import {z} from "zod";
import {db} from "./db";
import {deleteMediaIfUnused} from "./mediaAssets";
import {now} from "./types";
import type {Character,Conversation,MediaAsset,Message} from "./types";

export const CHAT_ARCHIVE_VERSION=1;
const archiveSchema=z.object({
  version:z.literal(CHAT_ARCHIVE_VERSION),
  exportedAt:z.number(),
  conversation:z.object({id:z.string(),type:z.enum(["private","group"]),title:z.string(),memberIds:z.array(z.string()),groupNpcs:z.array(z.any()).optional(),avatarAssetId:z.string().optional(),chatSettings:z.any().optional(),loreBookIds:z.array(z.string()).optional()}),
  messages:z.array(z.any()),
  mediaAssets:z.array(z.any()),
});
export type ChatArchive=z.infer<typeof archiveSchema>;
export type ChatImportMode="merge"|"replace";
export interface ChatImportPreview{messageCount:number;mediaCount:number;firstAt?:number;lastAt?:number;conflictCount:number}

function attachmentAssetIds(message:Message){return (message.attachments??[]).flatMap(attachment=>"assetId" in attachment&&attachment.assetId?[attachment.assetId]:[])}
export async function createChatArchive(conversation:Conversation):Promise<ChatArchive>{
  const messages=await db.messages.where("conversationId").equals(conversation.id).sortBy("createdAt");
  const assetIds=[...new Set([...messages.flatMap(attachmentAssetIds),...(conversation.avatarAssetId?[conversation.avatarAssetId]:[]),...(conversation.groupNpcs??[]).flatMap(npc=>npc.avatarAssetId?[npc.avatarAssetId]:[])])];
  const mediaAssets=(await db.mediaAssets.bulkGet(assetIds)).filter(Boolean) as MediaAsset[];
  return {version:CHAT_ARCHIVE_VERSION,exportedAt:now(),conversation:{id:conversation.id,type:conversation.type,title:conversation.title,memberIds:[...conversation.memberIds].sort(),groupNpcs:conversation.groupNpcs,avatarAssetId:conversation.avatarAssetId,chatSettings:conversation.chatSettings,loreBookIds:conversation.loreBookIds},messages,mediaAssets};
}
export function stringifyChatArchive(archive:ChatArchive){return JSON.stringify(archive,null,2)}
export function parseChatArchive(input:string):ChatArchive{return archiveSchema.parse(JSON.parse(input))}
function sameMembers(a:string[],b:string[]){return [...a].sort().join("\u0000")===[...b].sort().join("\u0000")}
export function assertChatArchiveMatches(archive:ChatArchive,conversation:Conversation){
  if(archive.conversation.type!==conversation.type||!sameMembers(archive.conversation.memberIds,conversation.memberIds))throw new Error("该聊天文件与当前会话类型或成员不匹配");
}
export async function previewChatImport(archive:ChatArchive,conversation:Conversation):Promise<ChatImportPreview>{
  assertChatArchiveMatches(archive,conversation);
  const ids=archive.messages.map((message:any)=>String(message.id));
  const conflicts=ids.length?await db.messages.bulkGet(ids):[];
  const times=archive.messages.map((message:any)=>Number(message.createdAt)).filter(Number.isFinite).sort((a,b)=>a-b);
  return {messageCount:archive.messages.length,mediaCount:archive.mediaAssets.length,firstAt:times[0],lastAt:times.at(-1),conflictCount:conflicts.filter(Boolean).length};
}
export async function importChatArchive(archive:ChatArchive,conversation:Conversation,mode:ChatImportMode){
  assertChatArchiveMatches(archive,conversation);
  const incomingMessages=archive.messages.map((message:any)=>({...message,conversationId:conversation.id})) as Message[];
  const old=mode==="replace"?await db.messages.where("conversationId").equals(conversation.id).toArray():[];
  const oldAssetIds=[...new Set(old.flatMap(attachmentAssetIds))];
  await db.transaction("rw",[db.messages,db.mediaAssets,db.conversations],async()=>{
    if(mode==="replace")await db.messages.where("conversationId").equals(conversation.id).delete();
    if(archive.mediaAssets.length)await db.mediaAssets.bulkPut(archive.mediaAssets as MediaAsset[]);
    if(mode==="merge"){
      const existing=await db.messages.bulkGet(incomingMessages.map(message=>message.id));
      const rows=incomingMessages.filter((_,index)=>!existing[index]);
      if(rows.length)await db.messages.bulkAdd(rows);
    }else if(incomingMessages.length)await db.messages.bulkPut(incomingMessages);
    const last=incomingMessages.reduce((max,message)=>Math.max(max,message.createdAt),conversation.createdAt);
    await db.conversations.update(conversation.id,{lastActivityAt:last,updatedAt:now(),...(mode==="replace"?{title:archive.conversation.title,avatarAssetId:archive.conversation.avatarAssetId,chatSettings:archive.conversation.chatSettings,groupNpcs:archive.conversation.groupNpcs??conversation.groupNpcs,loreBookIds:archive.conversation.loreBookIds??conversation.loreBookIds}:{})});
  });
  for(const assetId of oldAssetIds)await deleteMediaIfUnused(assetId);
}

function attachmentSummary(message:Message){
  const attachment=message.attachments?.[0];
  if(!attachment)return message.content;
  if(attachment.type==="image")return `[图片] ${attachment.description||message.content||"图片"}`;
  if(attachment.type==="sticker")return `[表情包] ${attachment.description||attachment.name}`;
  if(attachment.type==="voice")return `[语音 ${Math.round(attachment.durationMs/1000)}秒] ${attachment.transcript}`;
  if(attachment.type==="transfer")return `[转账] ¥${(attachment.amountCents/100).toFixed(2)} ${attachment.note??""}`.trim();
  if(attachment.type==="commerce")return `[订单] ${attachment.itemNames.join("、")} · ${attachment.recipientName}`;
  if(attachment.type==="call")return `[${attachment.callType==="video"?"视频":"语音"}通话] ${attachment.summary}`;
  if(attachment.type==="meet-invitation")return `[线下邀约] ${attachment.invitationText}`;
  if(attachment.type==="meet-event")return `[见面记录] ${attachment.summary}`;
  if(attachment.type==="couple-island-invitation")return `[${attachment.cardRole==="response"||message.senderType==="character"?"茶侣岛回应":"茶侣岛邀请"}] ${attachment.state === "accepted" ? "已接受" : attachment.state === "declined" ? `已拒绝${attachment.reason ? `：${attachment.reason}` : ""}` : "等待回应"}`;
  if(attachment.type==="red-packet")return `[红包] ¥${(attachment.totalAmountCents/100).toFixed(2)} · ${attachment.note}`;
  if(attachment.type==="poll")return `[投票] ${attachment.question} · ${attachment.options.map(option=>option.text).join(" / ")}`;
  return message.content;
}
export async function clearConversationMessages(conversation:Conversation){
  const rows=await db.messages.where("conversationId").equals(conversation.id).toArray();
  const assetIds=[...new Set(rows.flatMap(attachmentAssetIds))];
  await db.transaction("rw",[db.messages,db.conversations],async()=>{
    await db.messages.where("conversationId").equals(conversation.id).delete();
    await db.conversations.update(conversation.id,{lastActivityAt:now(),updatedAt:now()});
  });
  for(const assetId of assetIds)await deleteMediaIfUnused(assetId);
}
export function chatArchiveToText(conversation:Conversation,messages:Message[],characters:Character[],userName="我"){
  const nameOf=(message:Message)=>message.senderType==="user"?userName:message.senderType==="system"?"系统":characters.find(character=>character.id===message.senderId)?.name??conversation.groupNpcs?.find(npc=>npc.id===message.senderId)?.name??"成员";
  return [`${conversation.title} · 聊天记录`,`导出时间：${new Date().toLocaleString("zh-CN")}`,"",...[...messages].sort((a,b)=>a.createdAt-b.createdAt).map(message=>`[${new Date(message.createdAt).toLocaleString("zh-CN")}] ${nameOf(message)}\n${message.quote?`> 回复 ${message.quote.senderName}：${message.quote.preview}\n`:""}${attachmentSummary(message)||message.content}`)].join("\n\n");
}
