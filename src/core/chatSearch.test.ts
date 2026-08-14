import {describe,expect,it} from "vitest";
import {searchableMessageText,searchChatMessages} from "./chatSearch";
import type {Character,Message} from "./types";
const base={schemaVersion:1,createdAt:1,updatedAt:1,conversationId:"cv",senderType:"character" as const,senderId:"c",content:"",status:"complete" as const};
describe("chat search",()=>{
 it("searches quotes and media descriptions",()=>{const rows:Message[]=[{...base,id:"q",quote:{messageId:"old",senderType:"user",senderName:"我",kind:"text",preview:"周末去看海"}},{...base,id:"v",createdAt:2,kind:"voice",attachments:[{type:"voice",assetId:"a",durationMs:12000,transcript:"明天下午见"}]}];expect(searchChatMessages(rows,"看海",[{id:"c",name:"月白"} as Character])).toHaveLength(1);expect(searchableMessageText(rows[1])).toContain("明天下午见");const textImage={...base,id:"ti",createdAt:3,kind:"image" as const,attachments:[{type:"text-image" as const,description:"医院窗外刚刚泛白的天空",intent:"environment" as const,characterId:"c",generationEventId:"e",createdAt:3}]};expect(searchChatMessages([...rows,textImage],"医院窗外",[{id:"c",name:"月白"} as Character])).toHaveLength(1)});
 it("searches couple island invitations by feature and state",()=>{const invitation={...base,id:"island",kind:"couple-island-invitation" as const,attachments:[{type:"couple-island-invitation" as const,characterId:"c",islandId:"i",state:"accepted" as const}]};expect(searchableMessageText(invitation)).toContain("\u8336\u4fa3\u5c9b");expect(searchChatMessages([invitation],"\u5df2\u63a5\u53d7",[{id:"c",name:"C"} as Character])).toHaveLength(1)});
});

describe("sticker search metadata",()=>{
 it("searches the hidden sticker meaning",()=>{
  const sticker:Message={...base,id:"sticker",kind:"sticker",content:"[表情包]",attachments:[{type:"sticker",stickerId:"s",name:"无语",description:"无语地看着你"}]};
  const results=searchChatMessages([sticker],"无语地看着你",[{id:"c",name:"月白"} as Character]);expect(results).toHaveLength(1);expect(results[0].message).toBe(sticker);
 });
});

