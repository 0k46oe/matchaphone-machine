import {z} from "zod";
import {resolveSecondaryProvider} from "./modelServices";
import {OpenAIProvider,ProviderError} from "./provider";
import {uid,type Character,type Conversation,type GroupNpc,type MediaAsset,type ProviderSettings} from "./types";

export type GroupActor={type:"character"|"npc";id:string;name:string;avatar:string;character:Character;npc?:GroupNpc};

const profileSchema=z.object({
 persona:z.string().trim().min(1).max(800),
 speakingStyle:z.string().trim().min(1).max(300)
}).strict();

const stripFence=(text:string)=>text.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");

export function activeGroupNpcs(conversation?:Conversation){return (conversation?.groupNpcs??[]).filter(npc=>npc.active)}
export function groupNpcAvatar(npc:GroupNpc,assets:MediaAsset[]){return npc.avatarAssetId?assets.find(asset=>asset.id===npc.avatarAssetId)?.data??"":""}
export function groupNpcAsCharacter(npc:GroupNpc,avatar=""):Character{return{id:npc.id,schemaVersion:1,createdAt:npc.createdAt,updatedAt:npc.updatedAt,name:npc.name,avatar,bio:npc.basicInfo??"",personality:npc.persona,speakingStyle:npc.speakingStyle??"自然、符合人设",background:[npc.age&&`年龄：${npc.age}`,npc.identity&&`身份：${npc.identity}`,npc.basicInfo].filter(Boolean).join("\n"),language:"中文",coreSetting:[npc.identity,npc.basicInfo].filter(Boolean).join("；")||npc.persona,persona:npc.persona,proactive:{messages:false,timeAware:false,frequency:"low",quietStart:"23:00",quietEnd:"08:00",catchupLimit:0,dailyLimit:0},relationship:{intimacy:0,trust:0,mood:"平静",recentEvents:[]},lastActiveAt:npc.updatedAt}}
export function groupActors(conversation:Conversation,characters:Character[],assets:MediaAsset[]=[]):GroupActor[]{const characterActors=characters.filter(character=>conversation.memberIds.includes(character.id)).map(character=>({type:"character" as const,id:character.id,name:character.name,avatar:character.avatar,character})),npcActors=activeGroupNpcs(conversation).map(npc=>{const avatar=groupNpcAvatar(npc,assets);return{type:"npc" as const,id:npc.id,name:npc.name,avatar,character:groupNpcAsCharacter(npc,avatar),npc}});return[...characterActors,...npcActors]}
export function groupActorName(conversation:Conversation,characters:Character[],senderId?:string){return characters.find(character=>character.id===senderId)?.name||(conversation.groupNpcs??[]).find(npc=>npc.id===senderId)?.name||"成员"}
export function createGroupNpcDraft(input?:Partial<GroupNpc>):GroupNpc{const t=Date.now();return{id:input?.id??uid(),name:input?.name??"",age:input?.age??"",identity:input?.identity??"",basicInfo:input?.basicInfo??"",persona:input?.persona??"",speakingStyle:input?.speakingStyle??"",avatarAssetId:input?.avatarAssetId,active:input?.active??true,createdAt:input?.createdAt??t,updatedAt:t}}
export async function completeGroupNpcProfile(primary:ProviderSettings,input:Pick<GroupNpc,"name"|"age"|"identity"|"basicInfo"|"persona">,signal?:AbortSignal){const provider=await resolveSecondaryProvider(primary);if(!provider.apiKey.trim())throw new Error("尚未配置主 API 或副 API");const prompt=[`姓名：${input.name||"未填写"}`,input.age&&`年龄：${input.age}`,input.identity&&`身份或职业：${input.identity}`,input.basicInfo&&`基础信息：${input.basicInfo}`,input.persona&&`用户概括的人设：${input.persona}`,"请在不改变用户已填写事实的前提下，补全适合群聊互动的详细性格人设和说话风格。","只返回严格 JSON：{\"persona\":\"不超过800字的人设\",\"speakingStyle\":\"不超过300字的说话风格\"}"].filter(Boolean).join("\n");const raw=await new OpenAIProvider({...provider,stream:false}).chat([{role:"system",content:"你只负责补全虚构群聊 NPC 资料，只输出严格 JSON。"},{role:"user",content:prompt}],{stream:false,signal});let value:unknown;try{value=JSON.parse(stripFence(raw))}catch{throw new ProviderError("format","NPC 人设格式无法识别")}const parsed=profileSchema.safeParse(value);if(!parsed.success)throw new ProviderError("format","NPC 人设格式无法识别");return parsed.data}