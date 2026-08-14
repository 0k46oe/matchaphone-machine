import {describe,expect,it} from "vitest";
import {proactiveContent,proactiveMessages,scheduleUserPostInteractions,validateProactiveFeedStyle} from "./proactive";

describe("proactive structured output",()=>{
 it("validates and caps proactive bubbles",()=>expect(proactiveMessages({messages:[" 一 ","",...Array.from({length:9},(_,i)=>String(i))]})).toHaveLength(8));
 it("rejects empty proactive messages",()=>expect(()=>proactiveMessages({messages:[" "]})).toThrow());
 it("validates feed content",()=>expect(proactiveContent({content:" 动态 "})).toBe("动态"));
 it("keeps proactive feeds short, single-paragraph, and non-novelistic",()=>{
  expect(validateProactiveFeedStyle("今天想听点轻松的歌。晚点也一起吗？")).toMatchObject({valid:true,sentenceCount:2});
  expect(validateProactiveFeedStyle("第一段。\n第二段。")).toMatchObject({valid:false,reason:"正文必须只保留一个短段落"});
  expect(validateProactiveFeedStyle("一。二。三。四。")).toMatchObject({valid:false,sentenceCount:4});
  expect(validateProactiveFeedStyle("镜头缓缓移过窗外的余晖，指尖轻轻地落在杯沿，仿佛整个世界都在等待一句没有说出口的话。")).toMatchObject({valid:false,reason:"正文包含过多小说旁白、景物或细密动作描写"});
  expect(validateProactiveFeedStyle("好".repeat(121))).toMatchObject({valid:false,length:121});
 });
 it("schedules at most ten user-post comments inside three minutes",()=>{const createdAt=1000,characters=Array.from({length:12},(_,index)=>({id:`c${index}`,lastActiveAt:100-index} as any)),jobs=scheduleUserPostInteractions(characters,createdAt);expect(jobs).toHaveLength(10);expect(new Set(jobs.map(job=>job.characterId)).size).toBe(10);expect(jobs.every(job=>job.kind==="initial-comment"&&job.scheduledAt>=createdAt+5000&&job.scheduledAt<=createdAt+180000)).toBe(true)});
});
