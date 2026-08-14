import {db,getAppearance} from "./db";
import type {AppearanceSource} from "./types";

export function appearanceSourceUrl(source:AppearanceSource|undefined,assets:{id:string;data:string}[]){
  if(source?.type==="asset")return assets.find(asset=>asset.id===source.value)?.data;
  return source?.type==="url"?source.value:undefined;
}

function containsAsset(value:unknown,assetId:string,seen=new WeakSet<object>()):boolean{
  if(!value||typeof value!=="object")return false;
  const object=value as Record<string,unknown>;
  if(seen.has(object))return false;
  seen.add(object);
  if(object.type==="asset"&&object.value===assetId)return true;
  return Object.values(object).some(entry=>containsAsset(entry,assetId,seen));
}

export async function imageAssetIsReferenced(assetId:string){
  const [appearance,conversations]=await Promise.all([getAppearance(),db.conversations.toArray()]);
  return containsAsset(appearance,assetId)||conversations.some(conversation=>containsAsset(conversation.chatSettings?.chatBackground,assetId));
}

export async function deleteImageAssetIfUnused(assetId?:string){
  if(!assetId||await imageAssetIsReferenced(assetId))return false;
  await db.imageAssets.delete(assetId);
  return true;
}
