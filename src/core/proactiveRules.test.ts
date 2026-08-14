import {describe,expect,it} from "vitest";
import {characterDue,dueCount,emptyProactiveSettings,localDayStart,validChannel} from "./proactiveRules";
import type {Character,ProactiveChannelSettings} from "./types";
const active:ProactiveChannelSettings={enabled:true,intervalHours:2,catchupLimit:3,dailyLimit:5,lastSuccessAt:0};
describe("proactive rules",()=>{
 it("requires complete valid channel settings",()=>{expect(validChannel(active)).toBe(true);expect(validChannel({...active,intervalHours:undefined})).toBe(false);expect(validChannel({...active,catchupLimit:6})).toBe(false)});
 it("caps due events by catchup and daily remainder",()=>{expect(dueCount(active,10*3600000,0,4,true,0)).toBe(1);expect(dueCount(active,10*3600000,0,0,true,0)).toBe(3)});
 it("does not catch up offline time when time awareness is off",()=>expect(dueCount(active,10*3600000,0,0,false,9*3600000)).toBe(0));
 it("uses local midnight for daily accounting",()=>{const start=localDayStart(new Date(2026,6,23,12).getTime());expect(new Date(start).getHours()).toBe(0)});
 it("treats missing modern config as disabled",()=>{const c={createdAt:0,proactiveSettings:undefined} as Character;expect(emptyProactiveSettings().message.enabled).toBe(false);expect(characterDue(c,Date.now(),{message:0,feed:0},Date.now())).toEqual({message:0,feed:0})});
});