import {beforeEach,describe,expect,it} from "vitest";
import {db} from "./db";
import {ensurePrivateConversation,markCharacterAsFriend,markCharactersAsFriends} from "./contacts";
import {SCHEMA_VERSION,type Character} from "./types";

const character=(id:string,status:NonNullable<Character["contactState"]>["status"]):Character=>({
 id,schemaVersion:SCHEMA_VERSION,createdAt:1,updatedAt:1,name:id,avatar:"",bio:"",personality:"",speakingStyle:"",background:"",language:"中文",
 proactive:{messages:false,timeAware:false,frequency:"low",quietStart:"23:00",quietEnd:"08:00",catchupLimit:0,dailyLimit:0},
 relationship:{intimacy:0,trust:0,mood:"",recentEvents:[]},lastActiveAt:1,
 contactState:{status,blockedAt:status==="blocked"?2:undefined,friendRequest:status==="request-pending"?{id:"r",message:"again",createdAt:2,status:"pending"}:undefined},
} as Character);

describe("contact friendship flow",()=>{
 beforeEach(async()=>{await db.delete();await db.open()});
 it("replaces blocked and pending metadata when becoming friends",async()=>{
  await db.characters.bulkAdd([character("blocked","blocked"),character("pending","request-pending")]);
  await markCharacterAsFriend("blocked");
  await markCharactersAsFriends(["pending","pending"]);
  expect((await db.characters.get("blocked"))?.contactState).toEqual({status:"friend"});
  expect((await db.characters.get("pending"))?.contactState).toEqual({status:"friend"});
 });
 it("creates one private conversation and reuses it",async()=>{
  await db.characters.add(character("friend","friend"));
  const first=await ensurePrivateConversation("friend"),second=await ensurePrivateConversation("friend");
  expect(second.id).toBe(first.id);
  expect(await db.conversations.count()).toBe(1);
 });
 it("does not open a writable private chat for non-friends",async()=>{
  await db.characters.add(character("pending","request-pending"));
  await expect(ensurePrivateConversation("pending")).rejects.toThrow("尚未成为好友");
  expect(await db.conversations.count()).toBe(0);
 });
});
