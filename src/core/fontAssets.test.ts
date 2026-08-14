import {describe,expect,it} from "vitest";
import {activeAppearanceFont,appearanceFontCss,appearanceFontExtension,importAppearanceFontUrl,MAX_APPEARANCE_FONT_BYTES,validateAppearanceFont} from "./fontAssets";

describe("appearance font assets",()=>{
  it("accepts the supported font extensions",()=>{
    expect(appearanceFontExtension("My Font.WOFF2?version=2")).toBe("woff2");
    expect(validateAppearanceFont({name:"font.ttf",size:1024} as File)).toMatchObject({format:"truetype"});
    expect(validateAppearanceFont({name:"font.otf",size:1024} as File)).toMatchObject({format:"opentype"});
  });
  it("rejects unsupported or oversized files",()=>{
    expect(()=>validateAppearanceFont({name:"font.zip",size:1024} as File)).toThrow("仅支持");
    expect(()=>validateAppearanceFont({name:"font.woff2",size:MAX_APPEARANCE_FONT_BYTES+1} as File)).toThrow("8MB");
  });
  it("creates and selects a URL font",()=>{
    const font=importAppearanceFontUrl("https://example.com/fonts/round.woff2?v=2","圆体");
    expect(font).toMatchObject({name:"圆体",source:"url",format:"woff2",url:"https://example.com/fonts/round.woff2?v=2"});
    expect(activeAppearanceFont({fonts:[font],activeFontId:font.id})).toEqual(font);
    expect(()=>importAppearanceFontUrl("javascript:alert(1)")).toThrow("http");
  });
  it("generates a global font-face rule for local and URL fonts",()=>{
    const local={id:"local",name:"Matcha",source:"local" as const,fileName:"Matcha.woff2",mimeType:"font/woff2",format:"woff2" as const,sizeBytes:2,data:"data:font/woff2;base64,AA=="};
    expect(appearanceFontCss(local)).toContain("data:font/woff2;base64,AA==");
    const remote=importAppearanceFontUrl("https://example.com/matcha.woff2");
    const css=appearanceFontCss(remote);
    expect(css).toContain("@font-face");
    expect(css).toContain("https://example.com/matcha.woff2");
  });
});
