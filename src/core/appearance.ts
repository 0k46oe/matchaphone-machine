import type {LucideIcon} from "lucide-react";
import {BookOpen,Brain,Coffee,ContactRound,MessageCircleMore,Palette,Settings,ShoppingBag,Smartphone,MessagesSquare,Music2,HeartHandshake} from "lucide-react";
import type {
  AppearanceFont,
  AppearanceSettings,
  AppearanceSource,
  ComplimentBubbleWidgetData,
  DesktopAppId,
  DesktopItem,
  HeroWidgetData,
  ProfileStatusWidgetData
} from "./types";

export const DESKTOP_COLUMNS=4,DESKTOP_ROWS=6,MAX_DESKTOP_PAGES=5;
export interface DesktopAppDefinition{id:DesktopAppId;name:string;path:string;icon:LucideIcon}
export interface DesktopArrangement{items:DesktopItem[];dock:DesktopAppId[]}
export const DESKTOP_APPS:DesktopAppDefinition[]=[
  {id:"messages",name:"消息",path:"/messages/chats",icon:MessageCircleMore},
  {id:"characters",name:"角色",path:"/characters",icon:ContactRound},
  {id:"lore",name:"世界书",path:"/lore",icon:BookOpen},
  {id:"memories",name:"记忆小屋",path:"/memories",icon:Brain},
  {id:"appearance",name:"外观",path:"/appearance",icon:Palette},
  {id:"settings",name:"设置",path:"/settings",icon:Settings},
  {id:"meet",name:"见面",path:"/meet",icon:Coffee},
  {id:"mall",name:"MALL",path:"/mall",icon:ShoppingBag},
  {id:"phone-check",name:"查手机",path:"/phone-check",icon:Smartphone},
  {id:"forum",name:"论坛",path:"/forum",icon:MessagesSquare},
  {id:"music",name:"音乐",path:"/music",icon:Music2},
  {id:"couple-island",name:"茶侣岛",path:"/couple-island",icon:HeartHandshake}
];

const defaultImage=(value:string):AppearanceSource=>({type:"url",value});
export const defaultHeroData=():HeroWidgetData=>({
  topBackground:defaultImage("/hero-defaults/top.png"),
  sideImage:defaultImage("/hero-defaults/avatar.png"),
  bottomImageOne:defaultImage("/hero-defaults/bottom-1.png"),
  bottomImageTwo:defaultImage("/hero-defaults/bottom-2.png"),
  bottomImageThree:defaultImage("/hero-defaults/bottom-3.png"),
  pillText:"♡ Proceed with … 91%",
  titleText:"matcha"
});
export function normalizeHeroData(hero?:Partial<HeroWidgetData>):HeroWidgetData{
  const base=defaultHeroData();
  return{
    ...base,
    topBackground:hero?.topBackground??hero?.banner??base.topBackground,
    sideImage:hero?.sideImage??hero?.avatar??base.sideImage,
    bottomImageOne:hero?.bottomImageOne??hero?.rowOneImage??base.bottomImageOne,
    bottomImageTwo:hero?.bottomImageTwo??hero?.rowTwoImage??base.bottomImageTwo,
    bottomImageThree:hero?.bottomImageThree??base.bottomImageThree,
    pillText:hero?.pillText??hero?.label??base.pillText,
    titleText:hero?.titleText??hero?.rowOneText??base.titleText
  };
}

export const defaultProfileStatusData=():ProfileStatusWidgetData=>({
  image:defaultImage("/desktop-widgets/profile-cat.png"),
  captionText:"该用户是一只猫",
  typingText:"正在输入中..."
});
export function normalizeProfileStatusData(data?:Partial<ProfileStatusWidgetData>):ProfileStatusWidgetData{
  const base=defaultProfileStatusData();
  return{
    image:data?.image??base.image,
    captionText:typeof data?.captionText==="string"&&data.captionText.trim()?data.captionText.slice(0,80):base.captionText,
    typingText:typeof data?.typingText==="string"&&data.typingText.trim()?data.typingText.slice(0,80):base.typingText
  };
}
export const defaultComplimentBubbleData=():ComplimentBubbleWidgetData=>({text:"luv u...TT"});
export function normalizeComplimentBubbleData(data?:Partial<ComplimentBubbleWidgetData>):ComplimentBubbleWidgetData{
  const base=defaultComplimentBubbleData();
  return{ text:typeof data?.text==="string"&&data.text.trim()?data.text.slice(0,80):base.text };
}

export const createDesktopAppItem=(id:DesktopAppId,page:number,x:number,y:number,item?:Partial<DesktopItem>):DesktopItem=>({
  ...item,id:item?.id??`app-${id}`,kind:"app",appId:id,page,x,y,w:1,h:1
});
const app=createDesktopAppItem;
export const createHeroItem=(id="widget-hero"):DesktopItem=>({id,kind:"widget",widgetType:"hero-profile",hero:defaultHeroData(),page:0,x:0,y:0,w:4,h:2});
export const createProfileStatusItem=(id="widget-profile-status"):DesktopItem=>({id,kind:"widget",widgetType:"profile-status",profileStatus:defaultProfileStatusData(),page:0,x:0,y:2,w:2,h:2});
export const createComplimentBubbleItem=(id="widget-compliment-bubble"):DesktopItem=>({id,kind:"widget",widgetType:"compliment-bubble",complimentBubble:defaultComplimentBubbleData(),page:0,x:2,y:4,w:2,h:2});

const LEGACY_V18_APP_LAYOUT:Record<DesktopAppId,{page:number;x:number;y:number}>={
  messages:{page:0,x:2,y:2},characters:{page:0,x:3,y:2},
  appearance:{page:0,x:2,y:3},settings:{page:0,x:3,y:3},
  lore:{page:0,x:0,y:4},memories:{page:0,x:1,y:4},
  meet:{page:0,x:0,y:5},mall:{page:0,x:1,y:5},
  "phone-check":{page:1,x:0,y:0},forum:{page:1,x:1,y:0},music:{page:0,x:0,y:5},"couple-island":{page:0,x:1,y:5}
};
const DEFAULT_DOCK:DesktopAppId[]=["messages","characters","appearance","settings"];
const DEFAULT_DESKTOP_ORDER:DesktopAppId[]=["lore","memories","meet","mall","phone-check","forum","music","couple-island"];
const DEFAULT_APP_LAYOUT:Record<string,{page:number;x:number;y:number}>={
  lore:{page:0,x:2,y:2},memories:{page:0,x:3,y:2},
  meet:{page:0,x:2,y:3},mall:{page:0,x:3,y:3},
  "phone-check":{page:0,x:0,y:4},forum:{page:0,x:1,y:4},music:{page:0,x:0,y:5},"couple-island":{page:0,x:1,y:5}
};

export const defaultAppearance:AppearanceSettings={
  version:22,
  themeMode:"light",
  chatBubbleStyle:"default",
  chatAvatarShape:"circle",
  wallpaper:{type:"color",value:"#ffffff"},
  feedCover:{type:"color",value:"#b8b8ba"},
  iconSources:{},
  fonts:[],
  fontScale:1,
  dock:[...DEFAULT_DOCK],
  items:[
    createHeroItem(),createProfileStatusItem(),createComplimentBubbleItem(),
    ...DEFAULT_DESKTOP_ORDER.map(id=>app(id,DEFAULT_APP_LAYOUT[id].page,DEFAULT_APP_LAYOUT[id].x,DEFAULT_APP_LAYOUT[id].y))
  ]
};
export const cloneDefaultAppearance=():AppearanceSettings=>JSON.parse(JSON.stringify(defaultAppearance));

const safeSpan=(value:number|undefined,max:number)=>Math.max(1,Math.min(max,Number.isFinite(value)?Math.trunc(value!):1));
const clampItem=(item:DesktopItem):DesktopItem=>{
  const w=safeSpan(item.w,DESKTOP_COLUMNS),h=safeSpan(item.h,DESKTOP_ROWS);
  return{...item,w,h,page:Math.max(0,Math.min(MAX_DESKTOP_PAGES-1,Math.trunc(item.page)||0)),x:Math.max(0,Math.min(DESKTOP_COLUMNS-w,Math.trunc(item.x)||0)),y:Math.max(0,Math.min(DESKTOP_ROWS-h,Math.trunc(item.y)||0))};
};
export function overlaps(a:DesktopItem,b:DesktopItem){return a.page===b.page&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}
export function firstFreePosition(items:DesktopItem[],w:number,h:number,startPage=0){
  for(let page=Math.max(0,startPage);page<MAX_DESKTOP_PAGES;page++)for(let y=0;y<=DESKTOP_ROWS-h;y++)for(let x=0;x<=DESKTOP_COLUMNS-w;x++){
    const probe={id:"probe",kind:"widget" as const,widgetType:"photo-square" as const,page,x,y,w,h};
    if(!items.some(item=>overlaps(item,probe)))return{page,x,y};
  }
  return null;
}

const LEGACY_PILL_DEFAULTS=new Set(["☁︎ 梦幻天使核 ᯓᡣ𐭩","@抹茶丁"]);
const LEGACY_TITLE_DEFAULTS=new Set(["纯白回忆","♡ Proceed with … 91%","@my tears have no thoughts"]);
function migrateHeroToVersion5(hero?:Partial<HeroWidgetData>){
  const next=normalizeHeroData(hero),base=defaultHeroData();
  return{...next,pillText:LEGACY_PILL_DEFAULTS.has(next.pillText)?base.pillText:next.pillText,titleText:LEGACY_TITLE_DEFAULTS.has(next.titleText)?base.titleText:next.titleText};
}

function migrateItemsToVersion18(rawItems:DesktopItem[],legacyVersion:number){
  const items=rawItems.map(item=>({...item}));
  const heroSource=items.find(item=>item.widgetType==="hero-profile");
  const profileSource=items.find(item=>item.widgetType==="profile-status");
  const bubbleSource=items.find(item=>item.widgetType==="compliment-bubble");
  const hero={...(heroSource??createHeroItem()),kind:"widget" as const,widgetType:"hero-profile" as const,page:0,x:0,y:0,w:4,h:2,hero:legacyVersion<5?migrateHeroToVersion5(heroSource?.hero):normalizeHeroData(heroSource?.hero)};
  const profile={...(profileSource??createProfileStatusItem()),kind:"widget" as const,widgetType:"profile-status" as const,page:0,x:0,y:2,w:2,h:2,profileStatus:normalizeProfileStatusData(profileSource?.profileStatus)};
  const bubble={...(bubbleSource??createComplimentBubbleItem()),kind:"widget" as const,widgetType:"compliment-bubble" as const,page:0,x:2,y:4,w:2,h:2,complimentBubble:normalizeComplimentBubbleData(bubbleSource?.complimentBubble)};
  const placed:DesktopItem[]=[hero,profile,bubble];
  for(const definition of DESKTOP_APPS){
    const source=items.find(item=>item.kind==="app"&&item.appId===definition.id);
    const position=LEGACY_V18_APP_LAYOUT[definition.id];
    placed.push(app(definition.id,position.page,position.x,position.y,source));
  }
  const usedIds=new Set(placed.map(item=>item.id));
  const extras=items.filter(item=>item.kind==="widget"&&!usedIds.has(item.id)&&!["hero-profile","profile-status","compliment-bubble","clock","recent"].includes(String(item.widgetType)));
  for(const extra of extras){
    const normalized=clampItem(extra);
    const spot=firstFreePosition(placed,normalized.w,normalized.h,1);
    if(spot)placed.push({...normalized,...spot});
    else placed.push(normalized);
  }
  return placed;
}

function normalizeVersion18Items(rawItems:DesktopItem[],dock:DesktopAppId[]=[]){
  const seenIds=new Set<string>(),seenApps=new Set<DesktopAppId>();
  const items:DesktopItem[]=[];
  for(const raw of rawItems){
    if(!raw?.id||seenIds.has(raw.id))continue;
    let item:DesktopItem;
    if(raw.widgetType==="hero-profile")item={...raw,kind:"widget",page:0,x:0,y:0,w:4,h:2,hero:normalizeHeroData(raw.hero)};
    else if(raw.widgetType==="profile-status")item={...raw,kind:"widget",page:0,x:0,y:2,w:2,h:2,profileStatus:normalizeProfileStatusData(raw.profileStatus)};
    else if(raw.widgetType==="compliment-bubble")item={...raw,kind:"widget",page:0,x:2,y:4,w:2,h:2,complimentBubble:normalizeComplimentBubbleData(raw.complimentBubble)};
    else if(raw.kind==="app"&&raw.appId&&DESKTOP_APPS.some(def=>def.id===raw.appId)){
      if(seenApps.has(raw.appId))continue;
      seenApps.add(raw.appId);item={...raw,w:1,h:1};
    }else item=raw;
    seenIds.add(item.id);items.push(clampItem(item));
  }
  const ensureWidget=(type:"hero-profile"|"profile-status"|"compliment-bubble",create:()=>DesktopItem)=>{if(!items.some(item=>item.widgetType===type))items.push(create())};
  ensureWidget("hero-profile",()=>createHeroItem());
  ensureWidget("profile-status",()=>createProfileStatusItem());
  ensureWidget("compliment-bubble",()=>createComplimentBubbleItem());
  for(const definition of DESKTOP_APPS){
    if(dock.includes(definition.id)||items.some(item=>item.kind==="app"&&item.appId===definition.id))continue;
    const preferred=LEGACY_V18_APP_LAYOUT[definition.id],probe=app(definition.id,preferred.page,preferred.x,preferred.y);
    const spot=items.some(item=>overlaps(item,probe))?firstFreePosition(items,1,1,preferred.page):preferred;
    if(spot)items.push(app(definition.id,spot.page,spot.x,spot.y));
  }
  return items;
}

function compareAppPosition(a:DesktopItem,b:DesktopItem){return a.page-b.page||a.y-b.y||a.x-b.x}
function migrateItemsToVersion19(items:DesktopItem[],dock:DesktopAppId[]){
  const placed=items.filter(item=>item.kind==="widget").map(item=>({...item}));
  const apps=items.filter(item=>item.kind==="app"&&item.appId&&!dock.includes(item.appId)).sort(compareAppPosition);
  for(const item of apps){const spot=firstFreePosition(placed,1,1,0);if(spot)placed.push({...item,...spot,w:1,h:1})}
  return compactPages(placed);
}
function normalizeVersion19Items(rawItems:DesktopItem[],dock:DesktopAppId[],legacyVersion:number){
  const normalized=legacyVersion<18?migrateItemsToVersion18(rawItems,legacyVersion):normalizeVersion18Items(rawItems,dock);
  const unique=normalized.filter(item=>item.kind!=="app"||Boolean(item.appId&&!dock.includes(item.appId)));
  return legacyVersion<19?migrateItemsToVersion19(unique,dock):unique;
}
function migrateItemsToVersion20(items:DesktopItem[],legacyVersion:number){
  if(legacyVersion>=20)return items;
  const forcedText=defaultComplimentBubbleData().text;
  return items.map(item=>item.widgetType==="compliment-bubble"
    ?{...item,complimentBubble:{...normalizeComplimentBubbleData(item.complimentBubble),text:forcedText}}
    :item);
}

export function normalizeAppearance(input?:Partial<AppearanceSettings>|null):AppearanceSettings{
  const base=cloneDefaultAppearance();
  if(!input)return base;
  const legacyVersion=Number(input.version??1);
  const dock=(input.dock??base.dock).filter((id,index,all)=>DESKTOP_APPS.some(appDef=>appDef.id===id)&&all.indexOf(id)===index).slice(0,4);
  if(legacyVersion<19)for(const id of base.dock)if(dock.length<4&&!dock.includes(id))dock.push(id);
  let rawItems=(input.items?.length?input.items:base.items).map(item=>({...item}));
  if(legacyVersion<2)rawItems=rawItems.filter(item=>!["clock","recent"].includes(String(item.widgetType)));
  const items=migrateItemsToVersion20(normalizeVersion19Items(rawItems,dock,legacyVersion),legacyVersion);
  const legacyFont=(input as Partial<AppearanceSettings>&{font?:Partial<AppearanceFont>}).font;
  const rawFonts=input.fonts?.length?input.fonts:legacyFont?[legacyFont]:[];
  const fonts=rawFonts.map((font,index)=>({...font,id:font.id??("legacy-font-"+index),source:font.source??(font.url?"url":"local")} as AppearanceFont)).filter((font,index,all)=>Boolean(font.name&&font.format&&(font.source==="url"?font.url:font.data))&&all.findIndex(other=>other.id===font.id)===index);
  const activeFontId=fonts.some(font=>font.id===input.activeFontId)?input.activeFontId:legacyFont?fonts[0]?.id:undefined;
  const rawFontScale=Number(input.fontScale??1),fontScale=Math.max(.85,Math.min(1.25,Number.isFinite(rawFontScale)?rawFontScale:1));
  const themeMode=input.themeMode==="dark"||input.themeMode==="system"?input.themeMode:"light";
  const chatBubbleStyle=input.chatBubbleStyle==="kawaii"?"kawaii":"default";
  const chatAvatarShape=input.chatAvatarShape==="square"||input.chatAvatarShape==="rounded"?input.chatAvatarShape:"circle";
  return{...base,...input,version:22,themeMode,chatBubbleStyle,chatAvatarShape,fonts,activeFontId,fontScale,font:undefined,wallpaper:{...base.wallpaper,...input.wallpaper},feedCover:{...base.feedCover,...input.feedCover},iconSources:{...base.iconSources,...input.iconSources},dock,items};
}

export function moveDesktopItem(items:DesktopItem[],id:string,page:number,x:number,y:number){
  const moving=items.find(item=>item.id===id);if(!moving)return items;
  const next=items.filter(item=>item.id!==id).map(item=>({...item}));
  const placed=clampItem({...moving,page,x,y}),conflicts=next.filter(item=>overlaps(item,placed)),stable=next.filter(item=>!conflicts.includes(item));
  for(const item of conflicts){const spot=firstFreePosition([...stable,placed],item.w,item.h,placed.page);stable.push(spot?{...item,...spot}:item)}
  return[...stable,placed];
}
export function compactPages(items:DesktopItem[]){const pages=[...new Set(items.map(item=>item.page))].sort((a,b)=>a-b),map=new Map(pages.map((page,index)=>[page,index]));return items.map(item=>({...item,page:map.get(item.page)??0}))}

type DesktopCell={page:number;x:number;y:number};
const cellKey=(cell:DesktopCell)=>cell.page+":"+cell.x+":"+cell.y;
const compareCell=(a:DesktopCell,b:DesktopCell)=>a.page-b.page||a.y-b.y||a.x-b.x;
const targetCell=(page:number,x:number,y:number):DesktopCell=>({page:Math.max(0,Math.min(MAX_DESKTOP_PAGES-1,Math.trunc(page))),x:Math.max(0,Math.min(DESKTOP_COLUMNS-1,Math.trunc(x))),y:Math.max(0,Math.min(DESKTOP_ROWS-1,Math.trunc(y)))});
function cellBlockedByWidget(items:DesktopItem[],cell:DesktopCell){const probe:DesktopItem={id:"probe",kind:"app",page:cell.page,x:cell.x,y:cell.y,w:1,h:1};return items.some(item=>item.kind==="widget"&&overlaps(item,probe))}
function assignAppsToSlots(items:DesktopItem[],orderedApps:DesktopItem[],slots:DesktopCell[]){const assigned=new Map(orderedApps.map((item,index)=>[item.id,slots[index]]));return items.map(item=>{const cell=assigned.get(item.id);return cell?{...item,...cell,w:1,h:1}:item})}

export function reorderDesktopApp(items:DesktopItem[],itemId:string,page:number,x:number,y:number){
  const moving=items.find(item=>item.id===itemId&&item.kind==="app");
  if(!moving)return items;
  const target=targetCell(page,x,y);
  if(cellBlockedByWidget(items,target))return items;
  if(moving.page===target.page&&moving.x===target.x&&moving.y===target.y)return items;
  const apps=items.filter(item=>item.kind==="app").sort(compareAppPosition),origin:DesktopCell={page:moving.page,x:moving.x,y:moving.y};
  const occupied=apps.some(item=>item.id!==moving.id&&item.page===target.page&&item.x===target.x&&item.y===target.y);
  const slots=apps.map(item=>({page:item.page,x:item.x,y:item.y}));
  if(!occupied){const originIndex=slots.findIndex(cell=>cellKey(cell)===cellKey(origin));if(originIndex<0)return items;slots[originIndex]=target}
  const uniqueSlots=[...new Map(slots.map(cell=>[cellKey(cell),cell])).values()].sort(compareCell);
  if(uniqueSlots.length!==apps.length)return items;
  const ordered=apps.filter(item=>item.id!==moving.id),targetIndex=uniqueSlots.findIndex(cell=>cellKey(cell)===cellKey(target));
  if(targetIndex<0)return items;
  ordered.splice(targetIndex,0,moving);
  return assignAppsToSlots(items,ordered,uniqueSlots);
}
export const moveDesktopApp=reorderDesktopApp;

export function insertDockAppOnDesktop(items:DesktopItem[],appId:DesktopAppId,page:number,x:number,y:number){
  const existing=items.find(item=>item.kind==="app"&&item.appId===appId);
  if(existing)return reorderDesktopApp(items,existing.id,page,x,y);
  const target=targetCell(page,x,y);
  if(cellBlockedByWidget(items,target))return items;
  const apps=items.filter(item=>item.kind==="app").sort(compareAppPosition),slots=apps.map(item=>({page:item.page,x:item.x,y:item.y}));
  if(!slots.some(cell=>cellKey(cell)===cellKey(target)))slots.push(target);
  else{const free=firstFreePosition(items,1,1,target.page)??firstFreePosition(items,1,1,0);if(!free)return items;slots.push(free)}
  slots.sort(compareCell);
  const created=app(appId,target.page,target.x,target.y),targetIndex=slots.findIndex(cell=>cellKey(cell)===cellKey(target)),ordered=[...apps];
  ordered.splice(targetIndex,0,created);
  return assignAppsToSlots([...items,created],ordered,slots);
}

export function moveDesktopAppIntoDock(items:DesktopItem[],dock:DesktopAppId[],itemId:string,targetIndex:number):DesktopArrangement{
  const moving=items.find(item=>item.id===itemId&&item.kind==="app"&&item.appId);
  if(!moving?.appId)return{items,dock};
  const index=Math.max(0,Math.min(Math.min(dock.length,3),Math.trunc(targetIndex))),nextDock=[...dock],nextItems=items.filter(item=>item.id!==moving.id);
  if(nextDock.length<4){nextDock.splice(index,0,moving.appId);return{items:compactPages(nextItems),dock:nextDock}}
  const displaced=nextDock[index];nextDock[index]=moving.appId;
  nextItems.push(app(displaced,moving.page,moving.x,moving.y));
  return{items:compactPages(nextItems),dock:nextDock};
}
export function reorderDockApp(dock:DesktopAppId[],appId:DesktopAppId,targetIndex:number){
  const from=dock.indexOf(appId);if(from<0)return dock;
  const next=[...dock];next.splice(from,1);next.splice(Math.max(0,Math.min(next.length,Math.trunc(targetIndex))),0,appId);return next;
}
export function moveDockAppToDesktop(items:DesktopItem[],dock:DesktopAppId[],appId:DesktopAppId,page:number,x:number,y:number):DesktopArrangement{
  if(!dock.includes(appId))return{items,dock};
  const nextItems=insertDockAppOnDesktop(items,appId,page,x,y);
  if(nextItems===items)return{items,dock};
  return{items:compactPages(nextItems),dock:dock.filter(id=>id!==appId)};
}

export const builtinWallpapers:AppearanceSource[]=[{type:"color",value:"#ffffff"},{type:"color",value:"#f5f5f4"},{type:"color",value:"#f7eeee"},{type:"color",value:"#eef1f2"}];
