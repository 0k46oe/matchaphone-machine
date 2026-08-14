import {useEffect,useState} from "react";
import {Phone,PhoneOff,Video} from "lucide-react";
import {useLocation,useNavigate} from "react-router-dom";
import {canCharacterInteract} from "../core/conversationSettings";
import {pendingIncomingCall,resolveIncomingCall,type PendingIncomingCall} from "../core/incomingCalls";
import {useStore} from "../core/store";
import {Avatar} from "./ui";

export default function IncomingCallCoordinator(){
 const nav=useNavigate(),location=useLocation(),{characters,generating,reload}=useStore(),[call,setCall]=useState<PendingIncomingCall|null>(null);
 useEffect(()=>{const params=new URLSearchParams(location.search),eventId=params.get("incomingCall");if(!eventId)return;void pendingIncomingCall(eventId).then(value=>{if(value)setCall(value);else nav(location.pathname,{replace:true})})},[location.pathname,location.search,nav]);
 useEffect(()=>{const listener=(event:Event)=>{const detail=(event as CustomEvent<PendingIncomingCall>).detail,character=characters.find(item=>item.id===detail?.characterId);if(!detail||!canCharacterInteract(character))return;if(generating){void resolveIncomingCall(detail.eventId,"missed").then(reload);return}setCall(detail)};window.addEventListener("mira:incoming-call",listener);return()=>window.removeEventListener("mira:incoming-call",listener)},[characters,generating,reload]);
 useEffect(()=>{if(!call)return;const delay=Math.max(0,call.expiresAt-Date.now()),timer=window.setTimeout(()=>{void resolveIncomingCall(call.eventId,"missed").then(async()=>{setCall(null);await reload()})},delay);return()=>clearTimeout(timer)},[call,reload]);
 if(!call)return null;const character=characters.find(item=>item.id===call.characterId),video=call.callType==="video";
 const reject=async()=>{await resolveIncomingCall(call.eventId,"rejected");setCall(null);nav(`/messages/${call.conversationId}`,{replace:true});await reload()};
 const accept=async()=>{const current=call;await resolveIncomingCall(current.eventId,"accepted");setCall(null);nav(`/messages/${current.conversationId}?call=${current.callType}&caller=${current.characterId}`,{replace:true})};
 return <div className="incoming-call-screen"><div className="incoming-call-glow"/><small>{video?"视频来电":"语音来电"}</small><Avatar text={character?.name??"角色"} src={character?.avatar} size="lg"/><h2>{character?.name??"角色"}</h2><p>{call.summary}</p><div><button className="reject" onClick={()=>void reject()}><PhoneOff/><span>拒绝</span></button><button className="accept" onClick={()=>void accept()}>{video?<Video/>:<Phone/>}<span>接听</span></button></div></div>
}