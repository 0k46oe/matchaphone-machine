import {describe,expect,it} from "vitest";
import {canRegenerateMessage,createMessageQuote,messageInteractionContext,messageQuotePreview,selectMessageRange,toggleUserReaction} from "./messageInteractions";
import type {Message} from "./types";

const base=(overrides:Partial<Message>={}):Message=>({id:"m1",schemaVersion:1,createdAt:1,updatedAt:1,conversationId:"c1",senderType:"character",senderId:"ch1",content:"原始内容",status:"complete",...overrides});

describe("message interactions",()=>{
 it("creates compact snapshots for text and media messages",()=>{
  expect(createMessageQuote(base({content:"  很长的   文本  "}),"茶茶")).toMatchObject({messageId:"m1",senderName:"茶茶",kind:"text",preview:"很长的 文本"});
  expect(messageQuotePreview(base({kind:"image",attachments:[{type:"image",description:"海边的照片",visionMode:"description"}]}))).toBe("[图片] 海边的照片");
  expect(messageQuotePreview(base({kind:"voice",attachments:[{type:"voice",assetId:"a",durationMs:12000,transcript:"明天见"}]}))).toBe("[语音 0:12] 明天见");
  expect(messageQuotePreview(base({kind:"transfer",attachments:[{type:"transfer",amountCents:5200,currency:"CNY",state:"pending",note:"早餐"}]}))).toBe("[转账] ¥52.00 · 早餐");
  expect(messageQuotePreview(base({kind:"commerce",attachments:[{type:"commerce",orderId:"o",commerceType:"gift",direction:"character-to-user",title:"草莓蛋糕",itemNames:["蛋糕"],amountCents:8800,currency:"CNY",recipientName:"我",status:"placed"}]}))).toBe("[订单] 草莓蛋糕 · 蛋糕");
 });
 it("selects every message between the anchor and the target",()=>{
  expect([...selectMessageRange(["a","b","c","d"],new Set(["b"]),"b","d")]).toEqual(["b","c","d"]);
  expect([...selectMessageRange(["a","b","c","d"],new Set(["c"]),"c","a")]).toEqual(["a","b","c"]);
 });
 it("replaces and toggles the local user reaction",()=>{
  const liked=toggleUserReaction(undefined,"like",10);expect(liked).toMatchObject([{kind:"like",reactorType:"user",createdAt:10}]);
  expect(toggleUserReaction(liked,"like",11)).toEqual([]);
  expect(toggleUserReaction(liked,"heart",12)).toMatchObject([{kind:"heart",reactorType:"user",createdAt:12}]);
 });
 it("injects quote and reaction context without changing regeneration eligibility",()=>{
  const message=base({content:"为什么",quote:{messageId:"u",senderType:"user",senderName:"我",kind:"text",preview:"我很喜欢缘分这个词"},reactions:[{kind:"like",reactorType:"user",createdAt:1}]});
  expect(messageInteractionContext(message)).toContain("[回复 我：『我很喜欢缘分这个词』]");
  expect(messageInteractionContext(message)).toContain("用户对这条消息作出回应：赞 👍");
  expect(canRegenerateMessage(message)).toBe(true);
  expect(canRegenerateMessage(base({senderType:"user"}))).toBe(false);
  expect(canRegenerateMessage(base({status:"generating"}))).toBe(false);
 });
});

describe("sticker interaction previews",()=>{
 it("hides sticker meaning from quote previews",()=>{
  const sticker=base({kind:"sticker",content:"[表情包]",attachments:[{type:"sticker",stickerId:"s",name:"无语",description:"无语地看着你"}]});
  expect(messageQuotePreview(sticker)).toBe("[表情包]");
  expect(createMessageQuote(sticker,"茶茶").preview).toBe("[表情包]");
 });
});
