import {useEffect,useState} from "react";
import {Archive,ChevronLeft,CloudCog,Database,Save,ShieldCheck} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {getSetting,setSetting} from "../core/db";

type MemoryAppSettings={autoArchive:boolean;recallLimit:number;mediaBackupMode:"text-only"|"full"};
const defaults:MemoryAppSettings={autoArchive:true,recallLimit:10,mediaBackupMode:"text-only"};

export default function MemorySettingsPage(){
 const nav=useNavigate(),[draft,setDraft]=useState(defaults),[saved,setSaved]=useState(false);
 useEffect(()=>{void getSetting("memory-app-settings",defaults).then(setDraft)},[]);
 const update=<K extends keyof MemoryAppSettings>(key:K,value:MemoryAppSettings[K])=>{setDraft(current=>({...current,[key]:value}));setSaved(false)};
 const save=async()=>{await setSetting("memory-app-settings",draft);setSaved(true)};
 return <div className="app-page memory-settings-page">
  <header className="memory-settings-header"><button aria-label="返回记忆小屋" onClick={()=>nav("/memories")}><ChevronLeft/></button><h1>记忆设置</h1><span/></header>
  <main className="memory-settings-scroll">   <section className="memory-settings-card"><header><span><Archive/></span><div><small>MEMORY LIFECYCLE</small><h2>记忆生长与淡化</h2><p>调整记忆进入深处的方式，以及每次聊天可被想起的数量。</p></div></header><div className="memory-setting-toggle"><div><b>自动归档淡化记忆</b><small>只降低召回优先级，不会删除任何记忆</small></div><label aria-label="自动归档淡化记忆"><input type="checkbox" checked={draft.autoArchive} onChange={event=>update("autoArchive",event.target.checked)}/><i/></label></div><label className="memory-setting-field"><span><b>私聊最多召回数量</b><small>每次回复最多带入多少条相关记忆</small></span><div><input aria-label="私聊最多召回数量" type="number" min="2" max="20" value={draft.recallLimit} onChange={event=>update("recallLimit",Math.max(2,Math.min(20,Number(event.target.value))))}/><em>条</em></div></label></section>
   <section className="memory-settings-card"><header><span><Database/></span><div><small>BACKUP & PRIVACY</small><h2>记忆备份策略</h2><p>文字、记忆和情绪元数据可以进入备份，Embedding 向量可在恢复后重新生成。</p></div></header><label className="memory-setting-select"><span><CloudCog/><b>媒体上传方式</b></span><select aria-label="媒体上传方式" value={draft.mediaBackupMode} onChange={event=>update("mediaBackupMode",event.target.value as MemoryAppSettings["mediaBackupMode"])}><option value="text-only">自动备份文字与记忆，媒体仅完整备份</option><option value="full">完整备份时包含图片和语音</option></select></label><aside><ShieldCheck/><span><b>隐私提示</b><small>Embedding 向量和 API Key 不会进入备份。</small></span></aside></section>
   {saved&&<div className="memory-settings-saved"><ShieldCheck/><span>记忆设置已保存</span></div>}
   <button className="memory-settings-save" onClick={()=>void save()}><Save/>保存设置</button>
  </main>
 </div>
}