import {useEffect,useState} from "react";
import {MessageCircle,X} from "lucide-react";
import {useNavigate} from "react-router-dom";
import {backgroundActivitySettingsOf} from "../core/notificationSettings";
import {pauseBackgroundActivity,resumeBackgroundActivity,startBackgroundActivities,stopBackgroundActivity} from "../core/backgroundAudio";
import {registerTeaServiceWorker,type TeaNotificationPayload} from "../core/notifications";
import {useStore} from "../core/store";

export default function NotificationCoordinator(){
 const nav=useNavigate(),settings=useStore(state=>state.settings),[banner,setBanner]=useState<TeaNotificationPayload|null>(null);
 const background=backgroundActivitySettingsOf(settings),modesKey=(background.modes??[]).join("|");
 useEffect(()=>{
  void registerTeaServiceWorker();
  const onNotification=(event:Event)=>{const payload=(event as CustomEvent<TeaNotificationPayload>).detail;setBanner(payload);window.setTimeout(()=>setBanner(current=>current?.eventId===payload.eventId?null:current),5000)};
  const onMessage=(event:MessageEvent)=>{if(event.data?.type==="CHACHA_BACKGROUND_WAKE")window.dispatchEvent(new Event("mira:proactive-check"))};
  const onRealStart=()=>pauseBackgroundActivity(),onRealStop=()=>void resumeBackgroundActivity();
  window.addEventListener("mira:in-app-notification",onNotification);
  navigator.serviceWorker?.addEventListener("message",onMessage);
  window.addEventListener("mira:real-audio-start",onRealStart);
  window.addEventListener("mira:real-audio-stop",onRealStop);
  return()=>{window.removeEventListener("mira:in-app-notification",onNotification);navigator.serviceWorker?.removeEventListener("message",onMessage);window.removeEventListener("mira:real-audio-start",onRealStart);window.removeEventListener("mira:real-audio-stop",onRealStop)};
 },[]);
 useEffect(()=>{
  if(!background.enabled||!background.modes?.length){stopBackgroundActivity();return}
  const activate=()=>{void startBackgroundActivities(background.modes??[]);window.removeEventListener("pointerdown",activate)};
  window.addEventListener("pointerdown",activate,{once:true});
  return()=>window.removeEventListener("pointerdown",activate);
 },[background.enabled,modesKey]);
 return banner?<button className="in-app-notification-banner" onClick={()=>{setBanner(null);nav(banner.url)}}><span><MessageCircle/></span><div><b>{banner.title}</b><p>{banner.body}</p></div><i onClick={event=>{event.stopPropagation();setBanner(null)}}><X/></i></button>:null;
}
