import {useEffect,useState} from "react";
import {ArrowLeft,Check,Eye,EyeOff,Image as ImageIcon,KeyRound,Save,Settings2,Sparkles,Trash2,WandSparkles} from "lucide-react";
import {useNavigate,useSearchParams} from "react-router-dom";
import {getImageGenerationSettings,setSetting} from "../core/db";
import {testImageGeneration} from "../core/imageGeneration";
import {defaultImageGenerationSettings,type ImageGenerationProviderKind,type ImageGenerationSettings} from "../core/types";

function SectionTitle({icon,title,note}:{icon:React.ReactNode;title:string;note:string}){
 return <div className="image-section-title"><span className="image-section-icon">{icon}</span><div><b>{title}</b><small>{note}</small></div></div>;
}

export default function ImageGenerationSettingsPage(){
 const nav=useNavigate(),[params,setParams]=useSearchParams(),[settings,setSettings]=useState<ImageGenerationSettings>(defaultImageGenerationSettings),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[status,setStatus]=useState("");
 const requested=params.get("provider"),activeProvider:ImageGenerationProviderKind=requested==="novelai"?"novelai":requested==="openai"?"openai":settings.provider;
 const active=settings[activeProvider],providerName=activeProvider==="openai"?"OpenAI Images":"NovelAI",isCurrent=settings.provider===activeProvider;

 useEffect(()=>{void getImageGenerationSettings().then(setSettings)},[]);
 function patch<K extends ImageGenerationProviderKind>(kind:K,next:Partial<ImageGenerationSettings[K]>){
  setSettings(current=>({...current,[kind]:{...current[kind],...next}} as ImageGenerationSettings));
 }
 const save=async()=>{setBusy(true);try{await setSetting("image-generation",settings);setStatus(`${providerName} 设置已保存在当前设备`)}catch(error){setStatus(error instanceof Error?error.message:"保存生图设置失败")}finally{setBusy(false)}};
 const test=async()=>{setBusy(true);setStatus(`正在使用 ${providerName} 生成测试图片…`);try{const result=await testImageGeneration({...settings,provider:activeProvider});setStatus("连接成功，测试图片已生成");const win=window.open();if(win)win.document.write(`<img alt="test" style="display:block;max-width:100%;margin:auto" src="${result.dataUrl}">`)}catch(error){setStatus(error instanceof Error?error.message:"连接测试失败")}finally{setBusy(false)}};

 return <div className="page image-generation-settings-page">
  <header className="page-head image-page-head"><button aria-label="返回设置" onClick={()=>nav("/settings")}><ArrowLeft/></button><div><small>AI IMAGE</small><h1>AI 生图服务</h1></div></header>
  <nav className="image-provider-tabs" aria-label="生图服务切换">
   <button className={activeProvider==="openai"?"active":""} onClick={()=>setParams({provider:"openai"})}><i className="openai"><ImageIcon/></i><span><b>OpenAI Images</b><small>通用与文字理解</small></span>{settings.provider==="openai"&&<em>当前</em>}</button>
   <button className={activeProvider==="novelai"?"active":""} onClick={()=>setParams({provider:"novelai"})}><i className="novelai"><Sparkles/></i><span><b>NovelAI</b><small>插画与角色表现</small></span>{settings.provider==="novelai"&&<em>当前</em>}</button>
  </nav>

  <main className="image-generation-settings-body">
   <section className={`image-provider-hero image-provider-${activeProvider}`}>
    <div className="image-provider-orb">{activeProvider==="openai"?<ImageIcon/>:<Sparkles/>}</div>
    <div className="image-provider-copy"><small>{activeProvider==="openai"?"OPENAI IMAGE":"NOVELAI IMAGE"}</small><h2>{providerName}</h2><p>{activeProvider==="openai"?"适合理解自然语言、生成通用图片，并与角色动态内容配合。":"更适合动漫插画与角色表现，可细调尺寸、采样器和生成参数。"}</p><div className="image-provider-badges"><span className={active.enabled?"online":"offline"}><i/>{active.enabled?"服务已开启":"服务未开启"}</span>{isCurrent&&<span className="current"><Check/>当前生图服务</span>}</div></div>
    <label className="mini-switch image-master-switch" aria-label={`${providerName} 服务开关`}><input type="checkbox" checked={active.enabled} onChange={event=>patch(activeProvider,{enabled:event.target.checked})}/><span/></label>
   </section>

   <div className="image-provider-current"><span><b>{isCurrent?"正在作为当前生图服务":"设为当前生图服务"}</b><small>{isCurrent?"动态和其他生图入口会优先使用这里的配置":"只切换查看不会改变当前服务，点击后随保存生效"}</small></span><button className={isCurrent?"active":""} disabled={isCurrent} onClick={()=>setSettings(current=>({...current,provider:activeProvider}))}>{isCurrent?<><Check/>已选择</>:"设为当前"}</button></div>

   <section className="image-config-group">
    <SectionTitle icon={<KeyRound/>} title="连接服务" note="密钥只保存在当前设备，不进入备份"/>
    <div className="image-form-stack">
     <label><span>{activeProvider==="novelai"?"Persistent API Token":"API Key"}</span><div className="secret-input"><input type={show?"text":"password"} value={active.apiKey} onChange={event=>patch(activeProvider,{apiKey:event.target.value})} placeholder={`输入 ${providerName} 密钥`}/><button type="button" aria-label={show?"隐藏密钥":"显示密钥"} onClick={()=>setShow(!show)}>{show?<EyeOff/>:<Eye/>}</button></div></label>
     <label><span>Base URL</span><input value={active.baseUrl} onChange={event=>patch(activeProvider,{baseUrl:event.target.value})}/></label>
    </div>
    <button className={`image-clear-key ${active.apiKey?"has-key":"empty-key"}`} disabled={busy||!active.apiKey} onClick={()=>patch(activeProvider,{apiKey:""})}><Trash2/>{active.apiKey?"清除当前服务密钥":"尚未填写服务密钥"}</button>
   </section>

   <section className="image-config-group">
    <SectionTitle icon={<Settings2/>} title="模型与输出" note={activeProvider==="openai"?"选择模型、画面尺寸与生成质量":"设置模型、画布比例与采样参数"}/>
    <div className="image-form-stack"><label><span>模型</span><input value={active.model} onChange={event=>patch(activeProvider,{model:event.target.value})} placeholder="输入模型 ID"/></label></div>
    {activeProvider==="openai"?<div className="image-option-grid"><label><span>图片尺寸</span><select value={settings.openai.size} onChange={event=>patch("openai",{size:event.target.value})}><option value="1024x1024">1024 × 1024 · 方形</option><option value="1536x1024">1536 × 1024 · 横向</option><option value="1024x1536">1024 × 1536 · 竖向</option><option value="auto">自动</option></select></label><label><span>生成质量</span><select value={settings.openai.quality} onChange={event=>patch("openai",{quality:event.target.value})}><option value="low">低 · 更快</option><option value="medium">中 · 平衡</option><option value="high">高 · 更细致</option><option value="auto">自动</option></select></label></div>:<>
     <div className="image-option-grid"><label><span>宽度</span><input type="number" min="512" max="2048" step="64" value={settings.novelai.width} onChange={event=>patch("novelai",{width:Number(event.target.value)})}/></label><label><span>高度</span><input type="number" min="512" max="2048" step="64" value={settings.novelai.height} onChange={event=>patch("novelai",{height:Number(event.target.value)})}/></label><label><span>Steps</span><input type="number" min="1" max="50" value={settings.novelai.steps} onChange={event=>patch("novelai",{steps:Number(event.target.value)})}/></label><label><span>Scale</span><input type="number" min="1" max="20" step="0.1" value={settings.novelai.scale} onChange={event=>patch("novelai",{scale:Number(event.target.value)})}/></label></div>
     <div className="image-form-stack"><label><span>Sampler</span><input value={settings.novelai.sampler} onChange={event=>patch("novelai",{sampler:event.target.value})}/></label></div>
    </>}
   </section>

   <section className="image-config-group image-prompt-presets">
    <SectionTitle icon={<WandSparkles/>} title="提示词预设" note="每次生成时自动追加，具体生成请求仍可继续补充"/>
    <div className="image-form-stack">
     <label><span>正面预设词</span><textarea rows={4} value={active.positivePrompt} onChange={event=>patch(activeProvider,{positivePrompt:event.target.value})} placeholder="例如：干净构图、自然光线、细节清晰"/><small>用于固定画面风格、质量和构图倾向。</small></label>
     <label><span>负面预设词</span><textarea rows={4} value={active.negativePrompt} onChange={event=>patch(activeProvider,{negativePrompt:event.target.value})} placeholder="例如：模糊、畸形、低质量"/><small>用于减少不希望出现的元素或画面问题。</small></label>
    </div>
   </section>

   <section className="image-test-strip"><div><span className="image-test-icon"><WandSparkles/></span><span><b>测试当前配置</b><small>生成一张测试图片，确认密钥和模型可用</small></span></div><button disabled={busy||!active.enabled||!active.apiKey.trim()} onClick={()=>void test()}>{busy?"生成中…":"测试生成"}</button></section>
   {status&&<div className="settings-toast image-status-toast"><ImageIcon/>{status}</div>}
   <section className="image-save-panel"><div><span className="image-save-mark"><Save/></span><span><b>保存当前服务</b><small>保存服务参数以及当前生图服务选择</small></span></div><button className="image-save-button" disabled={busy} onClick={()=>void save()}>{busy?"正在保存…":`保存 ${providerName} 设置`}</button></section>
  </main>
 </div>;
}