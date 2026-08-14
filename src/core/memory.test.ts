import {describe,expect,it} from "vitest";
import {selectMemories} from "./memory";
import type {Memory} from "./types";
const m=(id:string,patch:Partial<Memory>={}):Memory=>({id,schemaVersion:1,createdAt:1,updatedAt:1,characterId:"c",kind:"fact",content:id,source:"test",importance:1,locked:false,...patch});
describe("memory selection",()=>{it("matches character and optional conversation",()=>{const got=selectMemories([m("global"),m("v",{conversationId:"v"}),m("other-v",{conversationId:"x"}),m("other-c",{characterId:"x"})],"c","v");expect(got.map(x=>x.id)).toEqual(["global","v"])});it("prioritizes locked then importance then updated time",()=>{const got=selectMemories([m("low"),m("important",{importance:5}),m("locked",{locked:true}),m("new",{importance:5,updatedAt:9})],"c","v");expect(got.map(x=>x.id)).toEqual(["locked","new","important","low"])});it("limits injection to 12",()=>{expect(selectMemories(Array.from({length:20},(_,i)=>m(String(i))),"c","v")).toHaveLength(12)})});
