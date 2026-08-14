import {describe,expect,it} from "vitest";
import {canRegenerateMessage} from "./messageInteractions";
import type {Message} from "./types";

const message=(senderType:Message["senderType"],status:Message["status"]="complete")=>({id:"m",senderType,status} as Message);

describe("chat regeneration actions",()=>{
 it("offers regeneration for every completed character message",()=>{
  expect(canRegenerateMessage(message("character"))).toBe(true);
  expect(canRegenerateMessage({...message("character"),generation:{model:"test",temperature:.7,speakerTurnId:"older-turn"}})).toBe(true);
 });
 it("does not offer regeneration for user, system or incomplete messages",()=>{
  expect(canRegenerateMessage(message("user"))).toBe(false);
  expect(canRegenerateMessage(message("system"))).toBe(false);
  expect(canRegenerateMessage(message("character","generating"))).toBe(false);
 });
});
