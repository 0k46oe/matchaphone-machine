import {useEffect,useRef} from "react";
import {autoExtract,createMeetExtractionBatch} from "../core/memoryExtraction";
import {ensureMemoryEmbeddings} from "../core/embedding";
import {refreshMemoryStates} from "../core/memory";
import {db} from "../core/db";
import {resolveSecondaryProvider} from "../core/modelServices";
import {completeBackgroundTask,claimDueBackgroundTasks,enqueueBackgroundTask,failBackgroundTask,pruneBackgroundTasks} from "../core/backgroundTasks";
import {processFeedInteractions,runProactive} from "../core/proactive";
import {runDueForumGenerations} from "../core/forum";
import {expireDueIncomingCalls} from "../core/incomingCalls";
import {retryPendingNotificationTasks} from "../core/notifications";
import {backgroundActivitySettingsOf,backgroundExecutionAllowed} from "../core/notificationSettings";
import {syncMallOrderStatuses} from "../core/mall";
import {useStore} from "../core/store";
import {refineMeetSessionSummary} from "../core/meetService";
import {runCoupleIslandUpdate} from "../core/coupleIsland";
import {runMusicDjTurn,runMusicSessionClosingNote} from "../core/musicDj";

let running=false;

export default function ProactiveRunner(){
 const {ready,provider,generating,reload,settings}=useStore();
 const onlineSince=useRef(Date.now());
 const background=backgroundActivitySettingsOf(settings);
 const backgroundEnabled=background.enabled&&Boolean(background.modes?.length);

 useEffect(()=>{
  if(!ready||!provider)return;
  const backgroundAllowed=()=>backgroundExecutionAllowed(settings,document.visibilityState);
  const canRun=()=>backgroundAllowed()||document.visibilityState==="visible";
  const check=async()=>{
   if(!canRun()||running||generating)return;
   running=true;
   try{
    const minute=Math.floor(Date.now()/60000),allowBackground=backgroundAllowed();
    if(allowBackground)await enqueueBackgroundTask({type:"proactive-check",entityId:String(minute),eventId:`proactive-check:${minute}`,scheduledAt:Date.now(),payload:{onlineSince:onlineSince.current}});
    const tasks=await claimDueBackgroundTasks(10,Date.now(),allowBackground?["proactive-check","proactive-call","embedding","memory-extraction","meet-summary","couple-island-update","music-dj-turn"]:["music-dj-turn"]);
    for(const task of tasks)try{
     if(task.type==="proactive-check"){
      await runProactive(provider,Number((task.payload as {onlineSince?:number})?.onlineSince??onlineSince.current));
      await runDueForumGenerations(provider);
      await autoExtract(provider);
      await refreshMemoryStates();
      await enqueueBackgroundTask({type:"embedding",entityId:String(minute),eventId:`embedding:${minute}`,scheduledAt:Date.now(),payload:{}});
      if(document.visibilityState==="visible"){await processFeedInteractions(provider);await syncMallOrderStatuses()}
     }else if(task.type==="meet-summary"){const payload=task.payload as {sessionId?:string};if(payload.sessionId)await refineMeetSessionSummary(payload.sessionId,provider)}else if(task.type==="couple-island-update"){const payload=task.payload as {islandId?:string};if(payload.islandId)await runCoupleIslandUpdate(payload.islandId,await resolveSecondaryProvider(provider))}else if(task.type==="music-dj-turn"){const payload=task.payload as {sessionId?:string;kind?:"turn"|"summary"};if(payload.sessionId){const selected=await resolveSecondaryProvider(provider);if(payload.kind==="summary")await runMusicSessionClosingNote(payload.sessionId,selected);else await runMusicDjTurn(payload.sessionId,selected)}}else if(task.type==="embedding"){try{await ensureMemoryEmbeddings(await db.memories.toArray())}catch{}}else if(task.type==="memory-extraction"){const payload=task.payload as {source?:string;sessionId?:string},character=task.characterId?await db.characters.get(task.characterId):undefined,session=payload.sessionId?await db.meetSessions.get(payload.sessionId):undefined;if(character&&session&&payload.source==="meet")await createMeetExtractionBatch(await resolveSecondaryProvider(provider),character,session)}else if(task.type==="proactive-call")await expireDueIncomingCalls();
     await completeBackgroundTask(task.id);
    }catch(error){await failBackgroundTask(task.id,error)}
    await expireDueIncomingCalls();
    await retryPendingNotificationTasks();
    await pruneBackgroundTasks();
    await reload();
   }finally{running=false}
  };
  void check();
  const interval=setInterval(()=>{if(canRun())void check()},60000);
  const wake=()=>{if(canRun())void check()};
  document.addEventListener("visibilitychange",wake);
  window.addEventListener("online",wake);
  window.addEventListener("mira:proactive-check",wake);
  return()=>{
   clearInterval(interval);
   document.removeEventListener("visibilitychange",wake);
   window.removeEventListener("online",wake);
   window.removeEventListener("mira:proactive-check",wake);
  };
 },[ready,provider,generating,reload,backgroundEnabled]);
 return null;
}
