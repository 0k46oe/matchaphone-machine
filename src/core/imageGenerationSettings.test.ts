import {beforeEach,describe,expect,it} from "vitest";
import {db,getImageGenerationSettings,setSetting} from "./db";
import {defaultImageGenerationSettings} from "./types";

describe("image generation settings compatibility",()=>{
 beforeEach(async()=>{await db.delete();await db.open()});
 it("fills new prompt preset fields for legacy saved settings",async()=>{
  await setSetting("image-generation",{provider:"openai",openai:{enabled:true,apiKey:"legacy",baseUrl:"https://example.com/v1",model:"image",size:"1024x1024",quality:"high"},novelai:{enabled:false,apiKey:"",baseUrl:"https://example.com",model:"nai",width:832,height:1216,sampler:"k_euler",steps:20,scale:5,negativePrompt:"legacy negative"}});
  const settings=await getImageGenerationSettings();
  expect(settings.openai.positivePrompt).toBe(defaultImageGenerationSettings.openai.positivePrompt);
  expect(settings.openai.negativePrompt).toBe(defaultImageGenerationSettings.openai.negativePrompt);
  expect(settings.novelai.positivePrompt).toBe(defaultImageGenerationSettings.novelai.positivePrompt);
  expect(settings.novelai.negativePrompt).toBe("legacy negative");
 });
});