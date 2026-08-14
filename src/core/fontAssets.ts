import {uid,type AppearanceFont} from "./types";

export const MAX_APPEARANCE_FONT_BYTES=8*1024*1024;
const supportedFormats={
  woff2:{mimeType:"font/woff2",format:"woff2"},
  woff:{mimeType:"font/woff",format:"woff"},
  ttf:{mimeType:"font/ttf",format:"truetype"},
  otf:{mimeType:"font/otf",format:"opentype"}
} as const;

export function appearanceFontExtension(name:string){
  const clean=name.trim().split(/[?#]/,1)[0];
  return clean.split(".").pop()?.toLowerCase()??"";
}
function fontInfo(name:string){const extension=appearanceFontExtension(name);if(!(extension in supportedFormats))throw new Error("仅支持 TTF、OTF、WOFF 和 WOFF2 字体");return supportedFormats[extension as keyof typeof supportedFormats]}
export function validateAppearanceFont(file:Pick<File,"name"|"size">){
  const info=fontInfo(file.name);
  if(file.size<=0)throw new Error("字体文件为空，请重新选择");
  if(file.size>MAX_APPEARANCE_FONT_BYTES)throw new Error("字体文件不能超过 8MB");
  return info;
}
function readDataUrl(file:File){return new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==="string"?resolve(reader.result):reject(new Error("字体读取失败"));reader.onerror=()=>reject(new Error("字体读取失败"));reader.readAsDataURL(file)})}
export async function importAppearanceFont(file:File):Promise<AppearanceFont>{
  const info=validateAppearanceFont(file),data=await readDataUrl(file),baseName=file.name.replace(/\.[^.]+$/,"").trim()||"自定义字体";
  return{id:uid(),name:baseName,source:"local",fileName:file.name,mimeType:file.type||info.mimeType,format:info.format,sizeBytes:file.size,data};
}
export function importAppearanceFontUrl(rawUrl:string,rawName=""):AppearanceFont{
  let parsed:URL;try{parsed=new URL(rawUrl.trim())}catch{throw new Error("请输入有效的字体 URL")}
  if(!["http:","https:"].includes(parsed.protocol))throw new Error("字体 URL 必须使用 http 或 https");
  const fileName=decodeURIComponent(parsed.pathname.split("/").pop()||"font.woff2"),info=fontInfo(fileName),name=rawName.trim()||fileName.replace(/\.[^.]+$/,"").trim()||"网络字体";
  return{id:uid(),name,source:"url",fileName,mimeType:info.mimeType,format:info.format,url:parsed.toString()};
}
export function activeAppearanceFont(appearance?:{fonts?:AppearanceFont[];activeFontId?:string;font?:AppearanceFont}|null){
  if(!appearance)return undefined;
  return appearance.fonts?.find(font=>font.id===appearance.activeFontId)??(!appearance.fonts?.length?appearance.font:undefined);
}
export function appearanceFontCss(font?:AppearanceFont){
  const value=font?.source==="url"?font.url:font?.data;
  if(!font||!value)return "";
  const source=JSON.stringify(value),family=`ChachajiImportedFont-${font.id.replace(/[^a-zA-Z0-9_-]/g,"")}`;
  return `@font-face{font-family:"${family}";src:url(${source}) format("${font.format}");font-display:swap;font-style:normal;}\n:root{--app-font:"${family}","PingFang SC","Noto Sans SC",system-ui,sans-serif;}\nhtml,body,button,input,textarea,select,#root *{font-family:var(--app-font)!important;}`;
}
