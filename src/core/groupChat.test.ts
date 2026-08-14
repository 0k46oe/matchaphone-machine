import {describe,expect,it} from "vitest";
import {validateMessageGroup,validateReplyOrder} from "./groupChat";
describe("group chat helpers",()=>{
 it("accepts a complete unique role order",()=>expect(validateReplyOrder({order:["b","a"]},["a","b"])).toEqual(["b","a"]));
 it("falls back when order is missing or duplicated",()=>{expect(validateReplyOrder({order:["a","a"]},["a","b"])).toEqual(["a","b"]);expect(validateReplyOrder({order:["a"]},["a","b"])).toEqual(["a","b"])});
 it("trims, removes blanks and caps a message group at six",()=>expect(validateMessageGroup({messages:[" 一 ","", "二","三","四","五","六","七"]})).toEqual(["一","二","三","四","五","六"]));
 it("rejects an empty message group",()=>expect(()=>validateMessageGroup({messages:[" "]})).toThrow());
});