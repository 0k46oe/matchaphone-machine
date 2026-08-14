import {describe,expect,it} from "vitest";
import {assertChatArchiveMatches,chatArchiveToText,parseChatArchive} from "./chatArchive";
import type {Conversation,Message} from "./types";
const conversation={id:"cv",schemaVersion:1,createdAt:1,updatedAt:1,title:"测试聊天",type:"private",memberIds:["c"],presetIds:[],loreBookIds:[],lastActivityAt:1} as Conversation;
const message={id:"m",schemaVersion:1,createdAt:2,updatedAt:2,conversationId:"cv",senderType:"user",content:"看看这个",kind:"image",attachments:[{type:"image",description:"海边照片",visionMode:"description"}],status:"complete"} as Message;
describe("chat archive",()=>{
 it("validates conversation membership",()=>{const archive=parseChatArchive(JSON.stringify({version:1,exportedAt:1,conversation:{id:"old",type:"private",title:"old",memberIds:["c"]},messages:[message],mediaAssets:[]}));expect(()=>assertChatArchiveMatches(archive,conversation)).not.toThrow();expect(()=>assertChatArchiveMatches({...archive,conversation:{...archive.conversation,memberIds:["other"]}},conversation)).toThrow(/不匹配/) });
 it("preserves message favorites in imported archives",()=>{const archive=parseChatArchive(JSON.stringify({version:1,exportedAt:1,conversation:{id:"old",type:"private",title:"old",memberIds:["c"]},messages:[{...message,favoritedAt:44}],mediaAssets:[]}));expect(archive.messages[0].favoritedAt).toBe(44)});
 it("creates a readable TXT summary",()=>{expect(chatArchiveToText(conversation,[message],[],"我")).toContain("[图片] 海边照片")});
 it("exports couple island invitation state",()=>{const invitation={...message,id:"island",kind:"couple-island-invitation" as const,content:"",attachments:[{type:"couple-island-invitation" as const,characterId:"c",islandId:"i",state:"declined" as const,reason:"later"}]};const text=chatArchiveToText(conversation,[invitation],[],"me");expect(text).toContain("[\u8336\u4fa3\u5c9b\u9080\u8bf7]");expect(text).toContain("later")});
});

describe("sticker text export",()=>{
 it("exports the hidden meaning for portable text records",()=>{
  const sticker={...message,id:"sticker",kind:"sticker" as const,content:"[表情包]",attachments:[{type:"sticker" as const,stickerId:"s",name:"无语",description:"无语地看着你"}]};
  expect(chatArchiveToText(conversation,[sticker],[],"我")).toContain("[表情包] 无语地看着你");
 });
});
