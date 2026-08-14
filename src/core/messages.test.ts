import {describe,expect,it} from "vitest";
import {formatForward} from "./messages";
import type {Character,Message} from "./types";
const base={schemaVersion:1,createdAt:1,updatedAt:1,status:"complete" as const,conversationId:"v"};
const characters=[{id:"c",name:"月白"} as Character];
describe("message utilities",()=>{it("formats mixed selected messages chronologically",()=>{const items:Message[]=[{...base,id:"2",createdAt:2,senderType:"character",senderId:"c",content:"晚上好"},{...base,id:"1",createdAt:1,senderType:"user",content:"你好"}];const text=formatForward(items,characters,"我");expect(text.indexOf("我：你好")).toBeLessThan(text.indexOf("月白：晚上好"));expect(text).toContain("转发的聊天记录")})});

describe("sticker forwarding",()=>{
 it("keeps sticker meaning in forwarded text while using the generic visible marker",()=>{
  const sticker:Message={...base,id:"sticker",senderType:"user",content:"[表情包]",kind:"sticker",attachments:[{type:"sticker",stickerId:"s",name:"无语",description:"无语地看着你",url:"https://example.com/s.png"}]};
  const text=formatForward([sticker],characters,"我");
  expect(text).toContain("我：[表情包] 无语地看着你");
 });
});
