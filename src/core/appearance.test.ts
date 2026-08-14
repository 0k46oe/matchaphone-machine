import {describe,expect,it} from "vitest";
import {
  DESKTOP_APPS,defaultAppearance,moveDesktopAppIntoDock,moveDockAppToDesktop,normalizeAppearance,
  overlaps,reorderDesktopApp,reorderDockApp
} from "./appearance";
import type {DesktopAppId,DesktopItem} from "./types";

const positionOf=(items:DesktopItem[],id:DesktopAppId)=>{const item=items.find(candidate=>candidate.appId===id);return item&&{page:item.page,x:item.x,y:item.y,w:item.w,h:item.h}};
const hasOverlap=(items:DesktopItem[])=>items.some((item,index)=>items.slice(index+1).some(other=>overlaps(item,other)));
const allAppIds=(items:DesktopItem[],dock:DesktopAppId[])=>[...items.filter(item=>item.kind==="app").map(item=>item.appId!),...dock];

const v18Items=():DesktopItem[]=>[
  ...defaultAppearance.items.filter(item=>item.kind==="widget").map(item=>structuredClone(item)),
  {id:"app-messages",kind:"app",appId:"messages",page:0,x:2,y:2,w:1,h:1},
  {id:"app-characters",kind:"app",appId:"characters",page:0,x:3,y:2,w:1,h:1},
  {id:"app-appearance",kind:"app",appId:"appearance",page:0,x:2,y:3,w:1,h:1},
  {id:"app-settings",kind:"app",appId:"settings",page:0,x:3,y:3,w:1,h:1},
  {id:"app-lore",kind:"app",appId:"lore",page:0,x:0,y:4,w:1,h:1},
  {id:"app-memories",kind:"app",appId:"memories",page:0,x:1,y:4,w:1,h:1},
  {id:"app-meet",kind:"app",appId:"meet",page:0,x:0,y:5,w:1,h:1},
  {id:"app-mall",kind:"app",appId:"mall",page:0,x:1,y:5,w:1,h:1},
  {id:"app-phone-check",kind:"app",appId:"phone-check",page:1,x:0,y:0,w:1,h:1},
  {id:"app-forum",kind:"app",appId:"forum",page:1,x:1,y:0,w:1,h:1}
];

describe("appearance migration",()=>{
  it("uses v22 with a unique music app and existing Dock apps",()=>{
    expect(defaultAppearance.version).toBe(22);
    expect(defaultAppearance.dock).toEqual(["messages","characters","appearance","settings"]);
    expect(defaultAppearance.themeMode).toBe("light");
    const widgets=defaultAppearance.items.filter(item=>item.kind==="widget");
    expect(widgets).toHaveLength(3);
    expect(widgets.find(item=>item.widgetType==="hero-profile")).toMatchObject({page:0,x:0,y:0,w:4,h:2,hero:{pillText:"♡ Proceed with … 91%",titleText:"matcha"}});
    expect(widgets.find(item=>item.widgetType==="profile-status")).toMatchObject({page:0,x:0,y:2,w:2,h:2,profileStatus:{image:{type:"url",value:"/desktop-widgets/profile-cat.png"},captionText:"该用户是一只猫",typingText:"正在输入中..."}});
    expect(widgets.find(item=>item.widgetType==="compliment-bubble")).toMatchObject({page:0,x:2,y:4,w:2,h:2,complimentBubble:{text:"luv u...TT"}});
    expect(positionOf(defaultAppearance.items,"lore")).toEqual({page:0,x:2,y:2,w:1,h:1});
    expect(positionOf(defaultAppearance.items,"memories")).toEqual({page:0,x:3,y:2,w:1,h:1});
    expect(positionOf(defaultAppearance.items,"meet")).toEqual({page:0,x:2,y:3,w:1,h:1});
    expect(positionOf(defaultAppearance.items,"mall")).toEqual({page:0,x:3,y:3,w:1,h:1});
    expect(positionOf(defaultAppearance.items,"phone-check")).toEqual({page:0,x:0,y:4,w:1,h:1});
    expect(positionOf(defaultAppearance.items,"forum")).toEqual({page:0,x:1,y:4,w:1,h:1});
    expect(defaultAppearance.items.some(item=>item.kind==="app"&&defaultAppearance.dock.includes(item.appId!))).toBe(false);
    expect(new Set(allAppIds(defaultAppearance.items,defaultAppearance.dock)).size).toBe(DESKTOP_APPS.length);
    expect(hasOverlap(defaultAppearance.items)).toBe(false);
  });

  it("reorders occupied desktop cells by continuous displacement",()=>{
    const items=defaultAppearance.items.map(item=>structuredClone(item));
    const moved=reorderDesktopApp(items,"app-phone-check",0,2,2);
    expect(positionOf(moved,"phone-check")).toMatchObject({x:2,y:2});
    expect(positionOf(moved,"lore")).toMatchObject({x:3,y:2});
    expect(positionOf(moved,"memories")).toMatchObject({x:2,y:3});
    expect(positionOf(moved,"meet")).toMatchObject({x:3,y:3});
    expect(positionOf(moved,"mall")).toMatchObject({x:0,y:4});
    expect(hasOverlap(moved)).toBe(false);
  });

  it("moves to empty desktop cells without disturbing unrelated apps",()=>{
    const items=defaultAppearance.items.map(item=>structuredClone(item));
    const moved=reorderDesktopApp(items,"app-meet",1,2,0);
    expect(positionOf(moved,"meet")).toMatchObject({page:1,x:2,y:0});
    expect(positionOf(moved,"lore")).toEqual(positionOf(items,"lore"));
    expect(positionOf(moved,"forum")).toEqual(positionOf(items,"forum"));
  });

  it("does not move a desktop app onto a fixed widget",()=>{
    const items=defaultAppearance.items.map(item=>structuredClone(item));
    expect(reorderDesktopApp(items,"app-lore",0,0,0)).toBe(items);
    expect(reorderDesktopApp(items,"app-lore",0,0,2)).toBe(items);
    expect(reorderDesktopApp(items,"app-lore",0,2,4)).toBe(items);
  });

  it("moves desktop apps into a non-full Dock and keeps apps unique",()=>{
    const dock:DesktopAppId[]=["messages","characters","appearance"];
    const result=moveDesktopAppIntoDock(defaultAppearance.items,dock,"app-lore",1);
    expect(result.dock).toEqual(["messages","lore","characters","appearance"]);
    expect(positionOf(result.items,"lore")).toBeUndefined();
    expect(new Set(allAppIds(result.items,result.dock)).size).toBe(allAppIds(result.items,result.dock).length);
  });

  it("swaps with the target Dock app when the Dock is full",()=>{
    const result=moveDesktopAppIntoDock(defaultAppearance.items,defaultAppearance.dock,"app-lore",2);
    expect(result.dock).toEqual(["messages","characters","lore","settings"]);
    expect(positionOf(result.items,"appearance")).toEqual(positionOf(defaultAppearance.items,"lore"));
    expect(positionOf(result.items,"lore")).toBeUndefined();
  });

  it("reorders Dock apps and moves a Dock app back onto the desktop",()=>{
    expect(reorderDockApp(defaultAppearance.dock,"messages",3)).toEqual(["characters","appearance","settings","messages"]);
    const result=moveDockAppToDesktop(defaultAppearance.items,defaultAppearance.dock,"messages",0,0,5);
    expect(result.dock).toEqual(["characters","appearance","settings"]);
    expect(positionOf(result.items,"messages")).toMatchObject({page:0,x:0,y:5});
    expect(new Set(allAppIds(result.items,result.dock)).size).toBe(allAppIds(result.items,result.dock).length);
  });

  it("migrates v18 once, removes Dock duplicates and preserves appearance and widget content",()=>{
    const legacy:any={...defaultAppearance,version:18,themeMode:"dark",wallpaper:{type:"url",value:"wall"},iconSources:{messages:{type:"url",value:"icon"}},dock:["settings","messages","characters","appearance"],items:v18Items().map(item=>item.widgetType==="hero-profile"?{...item,hero:{...item.hero,pillText:"custom",titleText:"custom title"}}:item)};
    const next=normalizeAppearance(legacy);
    expect(next.version).toBe(22);expect(next.themeMode).toBe("dark");expect(next.wallpaper).toEqual({type:"url",value:"wall"});expect(next.iconSources.messages).toEqual({type:"url",value:"icon"});expect(next.dock).toEqual(legacy.dock);
    expect(next.items.find(item=>item.widgetType==="hero-profile")).toMatchObject({hero:{pillText:"custom",titleText:"custom title"}});
    expect(next.items.find(item=>item.widgetType==="profile-status")).toMatchObject({profileStatus:{captionText:"该用户是一只猫",typingText:"正在输入中..."}});
    expect(next.items.filter(item=>item.kind==="app")).toHaveLength(8);
    expect(positionOf(next.items,"music")).toBeTruthy();
    expect(positionOf(next.items,"couple-island")).toBeTruthy();
    expect(next.items.filter(item=>item.kind==="app").every(item=>item.page===0)).toBe(true);
    expect(next.items.some(item=>item.kind==="app"&&next.dock.includes(item.appId!))).toBe(false);
    expect(normalizeAppearance(next)).toEqual(next);
  });

  it("keeps historical photo widgets and places apps around them without overlap",()=>{
    const custom:DesktopItem={id:"old-photo",kind:"widget",widgetType:"photo-square",url:"data:image/png;base64,AA==",page:1,x:0,y:0,w:2,h:2};
    const legacy:any={...defaultAppearance,version:18,items:[...v18Items(),custom]};
    const next=normalizeAppearance(legacy),photo=next.items.find(item=>item.id==="old-photo");
    expect(photo).toBeTruthy();expect(next.items.some((item,index)=>next.items.slice(index+1).some(other=>overlaps(item,other)))).toBe(false);
  });

  it("forces the Figma bubble copy once when migrating v19 to v22",()=>{
    const moved=reorderDesktopApp(defaultAppearance.items,"app-meet",1,2,0);
    const edited=moved.map(item=>item.widgetType==="profile-status"?{...item,profileStatus:{...item.profileStatus!,captionText:"自定义状态",typingText:"稍等一下"}}:item.widgetType==="compliment-bubble"?{...item,complimentBubble:{text:"custom hello"}}:item);
    const next=normalizeAppearance({...defaultAppearance,version:19,items:edited});
    expect(positionOf(next.items,"meet")).toMatchObject({page:1,x:2,y:0});
    expect(next.items.find(item=>item.widgetType==="profile-status")?.profileStatus).toMatchObject({captionText:"自定义状态",typingText:"稍等一下"});
    expect(next.items.find(item=>item.widgetType==="compliment-bubble")?.complimentBubble?.text).toBe("luv u...TT");
  });

  it("migrates v21 by adding only couple-island to the first free cell",()=>{
    const legacyItems=defaultAppearance.items.filter(item=>item.appId!=="couple-island").map(item=>structuredClone(item));
    const before=new Map(legacyItems.map(item=>[item.id,{page:item.page,x:item.x,y:item.y,w:item.w,h:item.h}]));
    const dock=[...defaultAppearance.dock];
    const next=normalizeAppearance({...defaultAppearance,version:21,items:legacyItems,dock});
    expect(next.version).toBe(22);
    expect(next.dock).toEqual(dock);
    expect(positionOf(next.items,"couple-island")).toEqual({page:0,x:1,y:5,w:1,h:1});
    for(const item of legacyItems)expect({page:next.items.find(row=>row.id===item.id)?.page,x:next.items.find(row=>row.id===item.id)?.x,y:next.items.find(row=>row.id===item.id)?.y,w:next.items.find(row=>row.id===item.id)?.w,h:next.items.find(row=>row.id===item.id)?.h}).toEqual(before.get(item.id));
    expect(normalizeAppearance(next)).toEqual(next);
  });

  it("preserves bubble edits after the appearance is already v22",()=>{
    const edited=defaultAppearance.items.map(item=>item.widgetType==="compliment-bubble"?{...item,complimentBubble:{text:"custom hello"}}:item);
    const next=normalizeAppearance({...defaultAppearance,version:22,items:edited});
    expect(next.items.find(item=>item.widgetType==="compliment-bubble")?.complimentBubble?.text).toBe("custom hello");
    expect(normalizeAppearance(next)).toEqual(next);
  });

  it("converts legacy hero fields and removes clock/recent widgets",()=>{
    const old:any={...defaultAppearance,version:4,items:[{id:"widget-clock",kind:"widget",widgetType:"clock",page:0,x:0,y:0,w:2,h:2},{id:"widget-recent",kind:"widget",widgetType:"recent",page:0,x:2,y:0,w:2,h:2},{id:"hero",kind:"widget",widgetType:"hero-profile",page:0,x:0,y:0,w:4,h:3,hero:{label:"kept",rowOneText:"custom title",rowOneImage:{type:"url",value:"one"},pillText:"☁︎ 梦幻天使核 ᯓᡣ𐭩"}}]};
    const next=normalizeAppearance(old),hero=next.items.find(item=>item.widgetType==="hero-profile")?.hero;
    expect(next.version).toBe(22);expect(next.items.some(item=>["clock","recent"].includes(String(item.widgetType)))).toBe(false);
    expect(hero?.pillText).toBe("♡ Proceed with … 91%");expect(hero?.titleText).toBe("custom title");expect(hero?.bottomImageOne).toEqual({type:"url",value:"one"});expect(hero?.bottomImageThree).toEqual({type:"url",value:"/hero-defaults/bottom-3.png"});
  });

  it("migrates fonts and normalizes appearance preferences",()=>{
    const font={name:"Matcha",fileName:"Matcha.woff2",mimeType:"font/woff2",format:"woff2" as const,sizeBytes:128,data:"data:font/woff2;base64,AA=="};
    const next=normalizeAppearance({...defaultAppearance,version:7,font} as any);expect(next.fonts).toHaveLength(1);expect(next.fonts[0]).toMatchObject({...font,source:"local"});expect(next.activeFontId).toBe(next.fonts[0].id);
    expect(normalizeAppearance({...defaultAppearance,fontScale:9}).fontScale).toBe(1.25);expect(normalizeAppearance({...defaultAppearance,themeMode:"system"}).themeMode).toBe("system");expect(normalizeAppearance({...defaultAppearance,chatBubbleStyle:"invalid" as any}).chatBubbleStyle).toBe("default");expect(normalizeAppearance({...defaultAppearance,chatAvatarShape:"rounded"}).chatAvatarShape).toBe("rounded");
  });
});
