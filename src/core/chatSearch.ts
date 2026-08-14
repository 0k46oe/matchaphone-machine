import type {Character,Conversation,Message} from "./types";

export interface ChatSearchResult{message:Message;senderName:string;summary:string}
export function searchableMessageText(message:Message){
  const attachmentText=(message.attachments??[]).map(attachment=>{
    if(attachment.type==="image"||attachment.type==="text-image")return attachment.description;
    if(attachment.type==="sticker")return `${attachment.name} ${attachment.description}`;
    if(attachment.type==="voice")return attachment.transcript;
    if(attachment.type==="transfer")return `${attachment.note??""} ${attachment.amountCents/100}`;
    if(attachment.type==="commerce")return `${attachment.title} ${attachment.itemNames.join(" ")} ${attachment.recipientName}`;
    if(attachment.type==="call")return attachment.summary;
    if(attachment.type==="meet-invitation")return attachment.invitationText;
    if(attachment.type==="meet-event")return attachment.summary;
    if(attachment.type==="couple-island-invitation")return `茶侣岛 情侣空间 ${attachment.cardRole==="response"||message.senderType==="character"?"角色回应":"邀请"} ${attachment.state === "accepted" ? "已接受" : attachment.state === "declined" ? "已拒绝" : "待回应"} ${attachment.reason ?? ""}`;
    if(attachment.type==="red-packet")return `${attachment.note} ${attachment.totalAmountCents/100} ${attachment.claims.map(claim=>claim.participantName??claim.characterName??"成员").join(" ")}`;
    if(attachment.type==="poll")return `${attachment.question} ${attachment.options.map(option=>option.text).join(" ")} ${attachment.votes.map(vote=>vote.voterName).join(" ")}`;
    return "";
  }).join(" ");
  return [message.content,message.quote?.preview,attachmentText].filter(Boolean).join(" ").replace(/\s+/g," ").trim();
}
export function searchChatMessages(messages:Message[],query:string,characters:Character[],userName="我",conversation?:Conversation):ChatSearchResult[]{
  const needle=query.trim().toLocaleLowerCase();if(!needle)return [];
  return messages.filter(message=>searchableMessageText(message).toLocaleLowerCase().includes(needle)).sort((a,b)=>b.createdAt-a.createdAt).map(message=>({message,senderName:message.senderType==="user"?userName:message.senderType==="system"?"系统":characters.find(character=>character.id===message.senderId)?.name??conversation?.groupNpcs?.find(npc=>npc.id===message.senderId)?.name??"成员",summary:searchableMessageText(message).slice(0,180)}));
}
