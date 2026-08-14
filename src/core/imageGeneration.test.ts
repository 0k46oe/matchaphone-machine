import {afterEach,describe,expect,it,vi} from "vitest";
import {generateImage} from "./imageGeneration";
import {defaultImageGenerationSettings} from "./types";

afterEach(()=>vi.unstubAllGlobals());

describe("image generation providers",()=>{
 it("reads an OpenAI base64 image response and applies prompt presets",async()=>{
  const fetchMock=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({data:[{b64_json:"aGVsbG8="}]}),{status:200,headers:{"Content-Type":"application/json"}}));
  vi.stubGlobal("fetch",fetchMock);
  const settings={...defaultImageGenerationSettings,provider:"openai" as const,openai:{...defaultImageGenerationSettings.openai,enabled:true,apiKey:"secret",positivePrompt:"editorial lighting",negativePrompt:"watermark"}},result=await generateImage(settings,{prompt:"tea",negativePrompt:"text"});
  expect(result).toMatchObject({provider:"openai",model:"gpt-image-2",dataUrl:"data:image/png;base64,aGVsbG8="});
  expect(String(fetchMock.mock.calls[0][0])).toContain("/images/generations");
  const body=JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(body.prompt).toContain("editorial lighting");
  expect(body.prompt).toContain("tea");
  expect(body.prompt).toContain("Avoid: watermark");
  expect(body.prompt).toContain("Avoid: text");
 });
 it("uses the NovelAI endpoint and includes positive and negative presets",async()=>{
  const fetchMock=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(new Uint8Array([137,80,78,71]),{status:200,headers:{"Content-Type":"image/png"}}));
  vi.stubGlobal("fetch",fetchMock);
  const settings={...defaultImageGenerationSettings,provider:"novelai" as const,novelai:{...defaultImageGenerationSettings.novelai,enabled:true,apiKey:"token",positivePrompt:"soft color",negativePrompt:"bad hands"}},result=await generateImage(settings,{prompt:"character portrait",negativePrompt:"letters"});
  expect(result.provider).toBe("novelai");
  expect(result.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  expect(String(fetchMock.mock.calls[0][0])).toContain("/ai/generate-image");
  const body=JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
  expect(body.input).toContain("soft color");
  expect(body.input).toContain("character portrait");
  expect(body.parameters.uc).toContain("bad hands");
  expect(body.parameters.uc).toContain("letters");
 });
 it("maps authentication failures",async()=>{vi.stubGlobal("fetch",vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response("denied",{status:401})));const settings={...defaultImageGenerationSettings,openai:{...defaultImageGenerationSettings.openai,enabled:true,apiKey:"bad"}};await expect(generateImage(settings,{prompt:"x"})).rejects.toMatchObject({code:"auth"})});
 it("requires an enabled configured provider",async()=>{await expect(generateImage(defaultImageGenerationSettings,{prompt:"x"})).rejects.toMatchObject({code:"config"})});
});