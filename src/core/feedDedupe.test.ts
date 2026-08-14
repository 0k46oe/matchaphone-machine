import {describe,expect,it} from "vitest";
import {duplicateFeedPost,feedContentSimilarity,normalizeFeedContent} from "./feedDedupe";
import type {FeedPost} from "./types";
const post=(content:string,createdAt=1):FeedPost=>({id:String(createdAt),schemaVersion:1,createdAt,updatedAt:createdAt,authorType:"character",authorId:"c1",content,liked:false,comments:[],origin:"proactive"});
describe("feed dedupe",()=>{
  it("normalizes whitespace, width and punctuation",()=>expect(normalizeFeedContent(" Ｈｅｌｌｏ， 世界！ ")).toBe("hello世界"));
  it("detects exact normalized duplicates across history",()=>expect(duplicateFeedPost("今天，喝了抹茶。",[post("今天喝了抹茶")],"c1")?.kind).toBe("exact"));
  it("detects highly similar recent posts",()=>{expect(feedContentSimilarity("整理完窗边的小桌，阳光刚好落在杯沿。","整理了窗边的小桌，阳光正好落在杯沿。" )).toBeGreaterThan(.85);expect(duplicateFeedPost("整理完窗边的小桌，阳光刚好落在杯沿。",[post("整理了窗边的小桌，阳光正好落在杯沿。")],"c1")?.kind).toBe("similar")});
  it("does not compare user or other-character posts",()=>{const rows=[{...post("完全一样"),authorType:"user" as const,authorId:"user"},{...post("完全一样",2),authorId:"c2"}];expect(duplicateFeedPost("完全一样",rows,"c1")).toBeUndefined()});
});
