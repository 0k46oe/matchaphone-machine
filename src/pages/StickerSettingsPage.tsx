import {useEffect,useRef,useState} from "react";
import {ArrowDown,ArrowLeft,ArrowUp,FileText,FolderPlus,ImagePlus,Link2,Plus,Save,Trash2,X} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {Modal} from "../components/ui";
import {db} from "../core/db";
import {deleteMediaIfUnused,saveImageMedia} from "../core/mediaAssets";
import {addStickerAsset,addStickerUrls,createStickerPack,parseStickerDocument,readStickerImportFile,STICKER_DOCUMENT_ACCEPT,updateSticker} from "../core/stickers";
import {now,type MediaAsset,type StickerImportEntry,type StickerImportPreview,type StickerPack} from "../core/types";

export default function StickerSettingsPage(){
 const nav=useNavigate();
 const [packs,setPacks]=useState<StickerPack[]>([]);
 const [assets,setAssets]=useState<Map<string,MediaAsset>>(new Map());
 const [active,setActive]=useState("");
 const [newName,setNewName]=useState("");
 const [urlText,setUrlText]=useState("");
 const [status,setStatus]=useState("");
 const [importPreview,setImportPreview]=useState<(StickerImportPreview&{fileName:string})|null>(null);
 const files=useRef<HTMLInputElement>(null),camera=useRef<HTMLInputElement>(null),documentRef=useRef<HTMLInputElement>(null);
 const load=async()=>{
  const [nextPacks,nextAssets]=await Promise.all([db.stickerPacks.orderBy("order").toArray(),db.mediaAssets.where("purpose").equals("sticker").toArray()]);
  setPacks(nextPacks);
  setAssets(new Map(nextAssets.map(asset=>[asset.id,asset])));
  setActive(current=>nextPacks.some(pack=>pack.id===current)?current:(nextPacks[0]?.id??""));
 };
 useEffect(()=>{void load()},[]);
 const pack=packs.find(item=>item.id===active);
 const create=async()=>{
  try{const next=await createStickerPack(newName);setNewName("");setActive(next.id);setStatus(`已创建“${next.name}”`);await load()}
  catch(error){setStatus(error instanceof Error?error.message:"创建失败")}
 };
 const addFiles=async(input:FileList|File[]|null)=>{
  if(!pack)return;
  const list=Array.from(input??[]).filter(file=>file.type.startsWith("image/"));
  if(!list.length){setStatus("没有选择可导入的图片");return}
  let imported=0;
  const failed:string[]=[];
  for(let index=0;index<list.length;index++){
   const file=list[index];
   setStatus(`正在导入 ${index+1}/${list.length}…`);
   try{
    const asset=await saveImageMedia(file,"sticker");
    await addStickerAsset(pack.id,asset.id,file.name.replace(/\.[^.]+$/,"")||"新表情");
    imported++;
   }catch{failed.push(file.name||`第 ${index+1} 张图片`)}
  }
  if(imported)await load();
  setStatus(failed.length?`成功 ${imported} 张，${failed.length} 张失败：${failed.slice(0,3).join("、")}${failed.length>3?"…":""}`:`已导入 ${imported} 张图片`);
 };
 const preparePreview=(preview:StickerImportPreview,fileName:string)=>{const existing=new Set((pack?.stickers??[]).map(item=>item.url?.toLocaleLowerCase()).filter(Boolean)),entries=preview.entries.filter(entry=>!existing.has(entry.url.toLocaleLowerCase()));setImportPreview({...preview,entries,fileName});setStatus(entries.length?`已识别 ${entries.length} 个表情，请确认导入`:"没有可导入的新链接")};
 const addUrls=()=>{const preview=parseStickerDocument(urlText);if(!preview.entries.length){setStatus(preview.warnings[0]??"请输入有效的图片链接");return}preparePreview(preview,"粘贴内容")};
 const importDocument=async(file?:File)=>{if(!file)return;setStatus("正在读取表情文档…");try{const preview=await readStickerImportFile(file);if(!preview.entries.length){setStatus(preview.warnings[0]??"文档中没有可导入的链接");return}preparePreview(preview,file.name)}catch(error){setStatus(error instanceof Error?error.message:"无法读取表情文档")}finally{if(documentRef.current)documentRef.current.value=""}};
 const patchPreview=(index:number,patch:Partial<StickerImportEntry>)=>setImportPreview(current=>current?{...current,entries:current.entries.map((entry,i)=>i===index?{...entry,...patch}:entry)}:current);
 const confirmImport=async()=>{if(!importPreview?.entries.length)return;let target=pack;if(!target)target=await createStickerPack(importPreview.fileName.replace(/\.(?:txt|docx|md|markdown|csv)$/i,"")||"链接表情");const items=await addStickerUrls(target.id,importPreview.entries);setActive(target.id);setUrlText("");setImportPreview(null);setStatus(`已导入 ${items.length} 个表情及含义`);await load()};
 const deletePack=async()=>{
  if(!pack)return;
  const ids=pack.stickers.map(item=>item.assetId).filter(Boolean) as string[];
  await db.stickerPacks.delete(pack.id);
  for(const id of ids)await deleteMediaIfUnused(id);
  setStatus("分组已删除");await load();
 };
 const movePack=async(delta:number)=>{
  const index=packs.findIndex(item=>item.id===active),other=packs[index+delta];
  if(!pack||!other)return;
  await db.transaction("rw",db.stickerPacks,async()=>{
   await db.stickerPacks.update(pack.id,{order:other.order,updatedAt:now()});
   await db.stickerPacks.update(other.id,{order:pack.order,updatedAt:now()});
  });
  await load();
 };
 const removeSticker=async(id:string,assetId?:string)=>{
  if(!pack)return;
  await db.stickerPacks.update(pack.id,{stickers:pack.stickers.filter(item=>item.id!==id).map((item,index)=>({...item,order:index})),updatedAt:now()});
  if(assetId)await deleteMediaIfUnused(assetId);
  await load();
 };
 const updateLocalSticker=(id:string,key:"name"|"description",value:string)=>setPacks(current=>current.map(item=>item.id===pack?.id?{...item,stickers:item.stickers.map(sticker=>sticker.id===id?{...sticker,[key]:value}:sticker)}:item));

 return <div className="page sticker-settings-page">
  <header className="page-head sticker-page-head"><button aria-label="返回设置" onClick={()=>nav("/settings")}><ArrowLeft/></button><div><small>CHAT MEDIA</small><h1>表情包管理</h1></div><span>{packs.reduce((sum,item)=>sum+item.stickers.length,0)} 个</span></header>
  <main className="sticker-settings-body">
   <section className="sticker-create-card"><div className="sticker-section-copy"><span><FolderPlus/></span><div><b>新建表情分组</b><small>按用途或风格整理表情，聊天设置中可按分组挂载。</small></div></div><div className="sticker-create"><input value={newName} maxLength={30} onChange={event=>setNewName(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&newName.trim())void create()}} placeholder="输入分组名称"/><button onClick={()=>void create()} disabled={!newName.trim()}><Plus/>创建</button></div></section>

   {packs.length>0&&<nav className="sticker-pack-tabs" aria-label="表情分组">{packs.map(item=><button key={item.id} className={item.id===active?"active":""} onClick={()=>setActive(item.id)}><span>{item.name}</span><em>{item.stickers.length}</em></button>)}</nav>}

   {pack?<>
    <section className="sticker-pack-card">
     <div className="sticker-pack-card-head"><div><small>CURRENT PACK</small><b>{pack.name}</b><span>{pack.stickers.length} 个表情</span></div><div className="sticker-order-actions"><button aria-label="向前移动分组" onClick={()=>void movePack(-1)} disabled={packs[0]?.id===pack.id}><ArrowUp/></button><button aria-label="向后移动分组" onClick={()=>void movePack(1)} disabled={packs.at(-1)?.id===pack.id}><ArrowDown/></button><button className="danger" aria-label="删除分组" onClick={()=>void deletePack()}><Trash2/></button></div></div>
     <div className="sticker-pack-tools"><label>分组名称<input value={pack.name} maxLength={30} onChange={event=>setPacks(current=>current.map(item=>item.id===pack.id?{...item,name:event.target.value}:item))}/></label><button onClick={async()=>{const clean=pack.name.trim();if(clean){await db.stickerPacks.update(pack.id,{name:clean,updatedAt:now()});setStatus("分组名称已保存");await load()}}}><Save/>保存</button></div>
    </section>

    <section className="sticker-import-card">
     <div className="sticker-section-copy"><span><ImagePlus/></span><div><b>添加表情</b><small>可从设备、相机、TXT 或图片链接导入。</small></div></div>
     <div className="sticker-imports"><button onClick={()=>files.current?.click()}><ImagePlus/><span>相册</span></button><button onClick={()=>camera.current?.click()}><ImagePlus/><span>拍摄</span></button><button onClick={()=>documentRef.current?.click()}><FileText/><span>文档</span></button><input hidden multiple ref={files} type="file" accept="image/*" onChange={event=>{const selected=Array.from(event.currentTarget.files??[]);event.currentTarget.value="";void addFiles(selected)}}/><input hidden ref={camera} type="file" accept="image/*" capture="environment" onChange={event=>{const selected=Array.from(event.currentTarget.files??[]);event.currentTarget.value="";void addFiles(selected)}}/><input hidden ref={documentRef} type="file" accept={STICKER_DOCUMENT_ACCEPT} onChange={event=>void importDocument(event.target.files?.[0])}/></div>
     <div className="sticker-url-import"><textarea rows={3} value={urlText} onChange={event=>setUrlText(event.target.value)} placeholder="粘贴“表情含义：图片链接”，支持同一行多组"/><button disabled={!urlText.trim()} onClick={addUrls}><Link2/>识别链接</button></div>
    </section>

    <section className="sticker-library-card"><div className="sticker-library-title"><div><b>分组内容</b><small>编辑名称和说明后单独保存。</small></div><span>{pack.stickers.length}</span></div><div className="sticker-manage-grid">{pack.stickers.length?[...pack.stickers].sort((a,b)=>a.order-b.order).map(sticker=><article key={sticker.id}><div className="sticker-preview"><img src={sticker.source==="asset"?assets.get(sticker.assetId??"")?.data:sticker.url} alt={sticker.name}/></div><label>名称<input value={sticker.name} maxLength={40} onChange={event=>updateLocalSticker(sticker.id,"name",event.target.value)}/></label><label>说明<textarea rows={2} value={sticker.description} maxLength={120} onChange={event=>updateLocalSticker(sticker.id,"description",event.target.value)} placeholder="描述它适合在什么语境使用"/></label><div><button aria-label="保存表情" onClick={async()=>{await updateSticker(pack.id,sticker.id,{name:sticker.name,description:sticker.description});setStatus("表情信息已保存");await load()}}><Save/></button><button className="danger" aria-label="删除表情" onClick={()=>void removeSticker(sticker.id,sticker.assetId)}><Trash2/></button></div></article>):<div className="sticker-empty-pack"><ImagePlus/><b>这个分组还是空的</b><p>从相册选择图片，或粘贴图片链接开始添加。</p><button onClick={()=>files.current?.click()}><ImagePlus/>选择图片</button></div>}</div></section>
   </>:<div className="sticker-empty-state"><span><FolderPlus/></span><h3>先创建一个表情分组</h3><p>也可以直接导入 TXT、DOCX、MD 或 CSV 语义链接文档。</p><button onClick={()=>documentRef.current?.click()}><FileText/>导入表情文档</button><input hidden ref={documentRef} type="file" accept={STICKER_DOCUMENT_ACCEPT} onChange={event=>void importDocument(event.target.files?.[0])}/></div>}
   {importPreview&&<Modal onClose={()=>setImportPreview(null)}><div className="sticker-import-preview"><div className="sheet-head"><div><small>IMPORT PREVIEW</small><h2>确认表情含义</h2></div><button aria-label="关闭导入预览" onClick={()=>setImportPreview(null)}><X/></button></div><p>已从「{importPreview.fileName}」识别 {importPreview.entries.length} 个链接，名称和说明已自动带入。</p>{importPreview.warnings.length>0&&<div className="sticker-import-warnings">{importPreview.warnings.map(warning=><span key={warning}>{warning}</span>)}</div>}<div className="sticker-import-preview-list">{importPreview.entries.map((entry,index)=><article key={entry.url}><img src={entry.url} alt={entry.name}/><div><input maxLength={40} value={entry.name} onChange={event=>patchPreview(index,{name:event.target.value})}/><textarea rows={2} maxLength={120} value={entry.description} onChange={event=>patchPreview(index,{description:event.target.value})}/><small>第 {entry.sourceLine} 行 · {entry.url}</small></div><button className="danger" aria-label={`移除${entry.name}`} onClick={()=>setImportPreview(current=>current?{...current,entries:current.entries.filter((_,i)=>i!==index)}:current)}><Trash2/></button></article>)}</div>{importPreview.ignoredLines.length>0&&<details><summary>查看未识别文本</summary>{importPreview.ignoredLines.map(line=><p key={line}>{line}</p>)}</details>}<button className="primary" disabled={!importPreview.entries.length} onClick={()=>void confirmImport()}>导入 {importPreview.entries.length} 个表情</button></div></Modal>}
   {status&&<div className="settings-toast sticker-settings-toast">{status}</div>}
  </main>
 </div>;
}