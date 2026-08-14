import {create} from "zustand";
import {db,getAppSettings,getProvider,getAppearance} from "./db";
import {migrateMeetSessionNarrative} from "./meet";
import type {AppSettings,Character,Conversation,FeedPost,LoreBook,Memory,Message,Preset,ProviderSettings,MemoryExtractionBatch,AppearanceSettings,ImageAsset,MeetSession} from "./types";

type State={
 ready:boolean;
 characters:Character[];
 conversations:Conversation[];
 messages:Message[];
 feedPosts:FeedPost[];
 loreBooks:LoreBook[];
 memories:Memory[];
 presets:Preset[];
 memoryExtractionBatches:MemoryExtractionBatch[];
 appearance:AppearanceSettings|null;
 imageAssets:ImageAsset[];
 meetSessions:MeetSession[];
 provider:ProviderSettings|null;
 settings:AppSettings|null;
 reload:()=>Promise<void>;
 reloadConversation:(conversationId:string)=>Promise<void>;
 mergeMessage:(message:Message)=>void;
 setGenerating:(id:string|null)=>void;
 generating:string|null;
};

export const useStore=create<State>((set)=>({
 ready:false,characters:[],conversations:[],messages:[],feedPosts:[],loreBooks:[],memories:[],presets:[],memoryExtractionBatches:[],appearance:null,imageAssets:[],meetSessions:[],provider:null,settings:null,generating:null,
 setGenerating:(id)=>set({generating:id}),
 mergeMessage:(message)=>set((state)=>({messages:[...state.messages.filter((row)=>row.id!==message.id),message]})),
 reloadConversation:async(conversationId)=>{
  const [conversation,messages]=await Promise.all([
   db.conversations.get(conversationId),
   db.messages.where("conversationId").equals(conversationId).toArray(),
  ]);
  set((state)=>({
   conversations:conversation?[...state.conversations.filter((row)=>row.id!==conversationId),conversation]:state.conversations,
   messages:[...state.messages.filter((row)=>row.conversationId!==conversationId),...messages],
  }));
 },
 reload:async()=>{const [characters,conversations,messages,feedPosts,loreBooks,memories,presets,memoryExtractionBatches,appearance,imageAssets,meetSessions,provider,settings]=await Promise.all([db.characters.toArray(),db.conversations.toArray(),db.messages.toArray(),db.feedPosts.toArray(),db.loreBooks.toArray(),db.memories.toArray(),db.presets.toArray(),db.memoryExtractionBatches.toArray().then(rows=>rows.filter(batch=>batch.source==="chat")),getAppearance(),db.imageAssets.toArray(),db.meetSessions.toArray().then(async rows=>{const meetSessions=rows.map(migrateMeetSessionNarrative),migrated=meetSessions.filter((row,index)=>row!==rows[index]);if(migrated.length)await db.meetSessions.bulkPut(migrated);return meetSessions}),getProvider(),getAppSettings()]);set({ready:true,characters,conversations,messages,feedPosts,loreBooks,memories,presets,memoryExtractionBatches,appearance,imageAssets,meetSessions,provider,settings})}
}));
