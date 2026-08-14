import {useEffect,useMemo,useRef,useState} from "react";
import {Grid3X3,ImagePlus,Pencil,UserRound,X} from "lucide-react";
import {Avatar,Modal} from "../components/ui";
import {db,setSetting} from "../core/db";
import {compressImage} from "../core/imageAssets";
import {useStore} from "../core/store";
import {userNicknameOf} from "../core/userPersona";
import type {FeedImageAttachment,FeedPost,MediaAsset} from "../core/types";

const when=(time:number)=>new Date(time).toLocaleDateString("zh-CN",{year:"numeric",month:"long",day:"numeric"});
function imageUrl(image:FeedImageAttachment,assets:Map<string,MediaAsset>){return image.source==="asset"?(image.assetId?assets.get(image.assetId)?.data:undefined):image.url}

export default function MeTab(){
 const {feedPosts,characters,memories,settings,reload}=useStore(),[assets,setAssets]=useState<Map<string,MediaAsset>>(new Map()),[editing,setEditing]=useState(false),[selected,setSelected]=useState<FeedPost|null>(null),[name,setName]=useState(settings?.userName??"我"),[handle,setHandle]=useState(settings?.userHandle??"chachaji"),[bio,setBio]=useState(settings?.userBio??"在茶茶机里记录每一段相遇。"),[avatar,setAvatar]=useState(settings?.userAvatar??""),[avatarUrl,setAvatarUrl]=useState(""),[saving,setSaving]=useState(false),fileRef=useRef<HTMLInputElement>(null);
 const posts=useMemo(()=>feedPosts.filter(post=>(post.authorType??"character")==="user").sort((a,b)=>b.createdAt-a.createdAt),[feedPosts]);
 useEffect(()=>{void db.mediaAssets.toArray().then(rows=>setAssets(new Map(rows.map(asset=>[asset.id,asset]))))},[feedPosts]);
 const openEdit=()=>{setName(settings?.userName??"我");setHandle(settings?.userHandle??"chachaji");setBio(settings?.userBio??"在茶茶机里记录每一段相遇。");setAvatar(settings?.userAvatar??"");setAvatarUrl("");setEditing(true)};
 const chooseAvatar=async(file?:File)=>{if(!file)return;const image=await compressImage(file,"icon",1024,700_000);setAvatar(image.data);if(fileRef.current)fileRef.current.value=""};
 const useAvatarUrl=()=>{try{const value=new URL(avatarUrl.trim());if(!/^https?:$/.test(value.protocol))throw new Error();setAvatar(value.toString());setAvatarUrl("")}catch{window.alert("请输入有效的 http 或 https 图片地址")}};
 const save=async()=>{const cleanName=name.trim(),cleanHandle=handle.trim().replace(/^@/,"").replace(/\s+/g,"_");if(!cleanName||!cleanHandle)return;setSaving(true);await setSetting("app",{...settings!,userNickname:cleanName,userHandle:cleanHandle.slice(0,30),userBio:bio.trim().slice(0,160),userAvatar:avatar});await reload();setEditing(false);setSaving(false)};
 const profileName=settings?.userName??"我",profileHandle=settings?.userHandle??"chachaji",profileBio=settings?.userBio??"在茶茶机里记录每一段相遇。",profileAvatar=settings?.userAvatar;
 return <div className="social-scroll me-tab insta-profile">
  <section className="insta-profile-head">
   <div className="insta-profile-main"><Avatar text={profileName} src={profileAvatar} size="lg"/><div className="insta-profile-counts"><div><b>{posts.length}</b><span>动态</span></div><div><b>{characters.length}</b><span>陪伴</span></div><div><b>{memories.length}</b><span>记忆</span></div></div></div>
   <div className="insta-profile-copy"><h2>{profileName}</h2><small>@{profileHandle}</small><p>{profileBio}</p></div>
   <button className="insta-edit-profile" onClick={openEdit}><Pencil/>编辑资料</button>
  </section>
  <div className="insta-grid-label"><Grid3X3/><span>我的动态</span></div>
  {posts.length?<section className="insta-post-grid">{posts.map(post=>{const first=post.images?.[0],src=first?imageUrl(first,assets):undefined;return <button key={post.id} onClick={()=>setSelected(post)} aria-label={post.content||"查看动态"}>{src?<img src={src} alt={first?.description||post.imageDescription||"动态图片"}/>:<span>{post.content||"动态"}</span>}{(post.images?.length??0)>1&&<i>+{post.images!.length-1}</i>}</button>})}</section>:<div className="insta-empty"><UserRound/><h3>还没有发布动态</h3><p>你在“动态”页面发布的朋友圈会展示在这里。</p></div>}
  {editing&&<Modal onClose={()=>setEditing(false)}><div className="sheet-head"><div><small>PROFILE</small><h2>编辑我的资料</h2></div><button onClick={()=>setEditing(false)}><X/></button></div><div className="insta-profile-editor"><button className="insta-avatar-editor" onClick={()=>fileRef.current?.click()}><Avatar text={name||"我"} src={avatar} size="lg"/><span><ImagePlus/>更换头像</span></button><input ref={fileRef} hidden type="file" accept="image/*" onChange={event=>void chooseAvatar(event.target.files?.[0])}/><label>名字<input maxLength={30} value={name} onChange={event=>setName(event.target.value)}/></label><label>用户名<div className="insta-handle-input"><span>@</span><input maxLength={30} value={handle} onChange={event=>setHandle(event.target.value)}/></div></label><label>个人简介<textarea maxLength={160} rows={4} value={bio} onChange={event=>setBio(event.target.value)}/></label><label>头像图片 URL<div className="insta-url-input"><input value={avatarUrl} onChange={event=>setAvatarUrl(event.target.value)} placeholder="https://..."/><button disabled={!avatarUrl.trim()} onClick={useAvatarUrl}>使用</button></div></label><button className="primary" disabled={saving||!name.trim()||!handle.trim()} onClick={()=>void save()}>{saving?"正在保存…":"保存资料"}</button>{avatar&&<button className="cancel-button" onClick={()=>setAvatar("")}>移除头像</button>}</div></Modal>}
  {selected&&<Modal onClose={()=>setSelected(null)}><div className="sheet-head"><div><small>MY POST</small><h2>{profileName}的动态</h2></div><button onClick={()=>setSelected(null)}><X/></button></div><article className="insta-post-detail"><div className="insta-post-author"><Avatar text={profileName} src={profileAvatar}/><div><b>{profileName}</b><small>@{profileHandle}</small></div></div>{selected.images?.length?<div className="insta-detail-images">{selected.images.map(image=>{const src=imageUrl(image,assets);return src?<img key={image.id} src={src} alt={image.description||selected.imageDescription||"动态图片"}/>:null})}</div>:null}{selected.content&&<p>{selected.content}</p>}<time>{when(selected.createdAt)}</time></article></Modal>}
 </div>
}