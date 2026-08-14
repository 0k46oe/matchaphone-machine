import {db} from "./db";
import {now,SCHEMA_VERSION,uid,type Conversation} from "./types";

export async function markCharacterAsFriend(characterId:string){
 const timestamp=now();
 await db.characters.update(characterId,{contactState:{status:"friend"},updatedAt:timestamp});
 return timestamp;
}

export async function markCharactersAsFriends(characterIds:Iterable<string>){
 const ids=[...new Set(characterIds)];
 if(!ids.length)return;
 const timestamp=now();
 await db.transaction("rw",db.characters,async()=>{
  for(const id of ids)await db.characters.update(id,{contactState:{status:"friend"},updatedAt:timestamp});
 });
}

export async function ensurePrivateConversation(characterId:string):Promise<Conversation>{
 return db.transaction("rw",[db.characters,db.conversations],async()=>{
  const character=await db.characters.get(characterId);
  if(!character)throw new Error("角色不存在");
  if(character.contactState?.status!=="friend")throw new Error("该角色尚未成为好友");
  const existing=(await db.conversations.where("memberIds").equals(characterId).toArray())
   .filter(item=>item.type==="private"&&item.memberIds.length===1)
   .sort((a,b)=>a.createdAt-b.createdAt)[0];
  if(existing)return existing;
  const timestamp=now(),conversation:Conversation={
   id:uid(),schemaVersion:SCHEMA_VERSION,createdAt:timestamp,updatedAt:timestamp,
   title:character.name,type:"private",memberIds:[character.id],presetIds:[],loreBookIds:[],lastActivityAt:timestamp,
  };
  await db.conversations.add(conversation);
  return conversation;
 });
}
