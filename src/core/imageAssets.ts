import {uid} from "./types";
import type {ImageAsset} from "./types";

export async function compressImage(file:File,purpose:ImageAsset["purpose"],maxSide=1920,targetBytes=1_000_000):Promise<ImageAsset>{
  if(!file.type.startsWith("image/"))throw new Error("请选择图片文件");
  const bitmap=await createImageBitmap(file),scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
  const width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
  const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("当前浏览器无法处理图片");ctx.drawImage(bitmap,0,0,width,height);bitmap.close();
  let quality=.86,blob:Blob|null=null;for(let i=0;i<5;i++){blob=await new Promise(r=>canvas.toBlob(r,"image/webp",quality));if(blob&&blob.size<=targetBytes)break;quality-=.12}
  if(!blob)blob=await new Promise(r=>canvas.toBlob(r,"image/jpeg",.8));if(!blob)throw new Error("图片压缩失败");
  const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob!)}),t=Date.now();
  return{id:uid(),createdAt:t,updatedAt:t,purpose,mimeType:blob.type,width,height,data};
}
