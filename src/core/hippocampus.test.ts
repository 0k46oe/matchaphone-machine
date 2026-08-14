import {describe,expect,it} from "vitest";
import {memoryEmotionBand,memoryStateAt,memoryStrength,selectMemories} from "./memory";
import {cosineSimilarity} from "./embedding";
import {defaultMemoryExtractionSettings} from "./memoryExtraction";
import type {Memory} from "./types";
const base=(patch:Partial<Memory>={}):Memory=>({id:"m",schemaVersion:1,createdAt:Date.now(),updatedAt:Date.now(),characterId:"c",kind:"fact",content:"用户喜欢雨天",source:"test",importance:6,locked:false,occurredAt:Date.now(),confidence:.9,valence:.8,arousal:.4,activationCount:0,reinforcementCount:0,state:"active",...patch});
describe("hippocampal memory",()=>{
 it("defaults to enabled automatic extraction every 50 messages",()=>{expect(defaultMemoryExtractionSettings()).toMatchObject({enabled:true,mode:"auto",chatThreshold:50,autoSaveHighConfidence:true,meetMemoryEnabled:true})});
 it("protects locked memories and excludes requested forgotten memories",()=>{expect(memoryStrength(base({locked:true}))).toBe(1);expect(selectMemories([base({id:"hidden",dontSurface:true}),base({id:"shown"})],"c","v",10,"雨天").map(item=>item.id)).toEqual(["shown"])});
 it("derives emotion regions and fading state",()=>{expect(memoryEmotionBand(base())).toBe("积极平静");const old=base({occurredAt:Date.now()-400*86400000,updatedAt:Date.now()-20*86400000,importance:1,valence:.5,arousal:0});expect(["faded","archived"]).toContain(memoryStateAt(old))});
 it("computes cosine similarity for embedding vectors",()=>{expect(cosineSimilarity([1,0],[1,0])).toBeCloseTo(1);expect(cosineSimilarity([1,0],[0,1])).toBeCloseTo(0)});
});
