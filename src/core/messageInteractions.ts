import type {Message,MessageQuote,MessageReaction,MessageReactionKind} from "./types";

export const MESSAGE_REACTION_META:Record<MessageReactionKind,{emoji:string;label:string}>={
 heart:{emoji:"❤️",label:"爱心"},
 like:{emoji:"👍",label:"赞"},
 dislike:{emoji:"👎",label:"踩"},
 laugh:{emoji:"😂",label:"哈哈"},
 emphasis:{emoji:"‼️",label:"强调"},
 question:{emoji:"❓",label:"疑问"}
};

const compact=(value:string)=>value.replace(/\s+/g," ").trim();
const limit=(value:string,max=180)=>{const text=compact(value);return text.length>max?text.slice(0,max-1)+"…":text};
const duration=(ms:number)=>{const total=Math.max(0,Math.round(ms/1000)),minutes=Math.floor(total/60),seconds=String(total%60).padStart(2,"0");return minutes+":"+seconds};

export function messageQuotePreview(message:Message,max=180){
 const attachment=message.attachments?.[0];
 if(!attachment)return limit(message.content||"[消息]",max);
 if(attachment.type==="image")return limit("[图片] "+(attachment.description||"图片"),max);
 if(attachment.type==="text-image")return limit("[文字图片] "+attachment.description,max);
 if(attachment.type==="sticker")return limit("[表情包]",max);
 if(attachment.type==="voice")return limit("[语音 "+duration(attachment.durationMs)+"] "+(attachment.transcript||"语音消息"),max);
 if(attachment.type==="transfer")return limit("[转账] ¥"+(attachment.amountCents/100).toFixed(2)+(attachment.note?" · "+attachment.note:""),max);
 if(attachment.type==="commerce")return limit("[订单] "+attachment.title+(attachment.itemNames.length?" · "+attachment.itemNames.join("、"):""),max);
 if(attachment.type==="call")return limit("["+(attachment.callType==="video"?"视频通话":"语音通话")+"] "+duration(attachment.durationMs)+" · "+attachment.summary,max);
 if(attachment.type==="meet-invitation")return limit("[见面邀请] "+attachment.invitationText,max);
 if(attachment.type==="meet-event")return limit("[见面记录] "+attachment.summary,max);
 if(attachment.type==="red-packet")return limit("[红包] ¥"+(attachment.totalAmountCents/100).toFixed(2)+" · "+attachment.note,max);
 if(attachment.type==="poll")return limit("[投票] "+attachment.question,max);
 return limit(message.content||"[消息]",max);
}

export function createMessageQuote(message:Message,senderName:string):MessageQuote{
 return{messageId:message.id,senderType:message.senderType,senderId:message.senderId,senderName:senderName||"未知发送者",kind:message.kind??"text",preview:messageQuotePreview(message)};
}

export function toggleUserReaction(reactions:MessageReaction[]|undefined,kind:MessageReactionKind,createdAt=Date.now()):MessageReaction[]{
 const others=(reactions??[]).filter(reaction=>reaction.reactorType!=="user");
 const current=(reactions??[]).find(reaction=>reaction.reactorType==="user");
 if(current?.kind===kind)return others;
 return[...others,{kind,reactorType:"user",reactorId:"local-user",createdAt}];
}

export function userReactionOf(message:Message){return message.reactions?.find(reaction=>reaction.reactorType==="user")}
export function canRegenerateMessage(message:Message){return (message.senderType==="character"||message.senderType==="npc")&&message.status==="complete"}

export function selectMessageRange(messageIds:string[],selected:Set<string>,anchorId:string|undefined,targetId:string){
 const anchorIndex=anchorId?messageIds.indexOf(anchorId):-1,targetIndex=messageIds.indexOf(targetId);
 if(targetIndex<0)return new Set(selected);
 if(anchorIndex<0)return new Set([targetId]);
 return new Set(messageIds.slice(Math.min(anchorIndex,targetIndex),Math.max(anchorIndex,targetIndex)+1));
}

export function messageInteractionContext(message:Message,baseContent=message.content){
 const lines:string[]=[];
 if(message.quote)lines.push("[回复 "+message.quote.senderName+"：『"+message.quote.preview+"』]");
 lines.push(baseContent);
 const reaction=userReactionOf(message);
 if(reaction)lines.push("[用户对这条消息作出回应："+MESSAGE_REACTION_META[reaction.kind].label+" "+MESSAGE_REACTION_META[reaction.kind].emoji+"]");
 return lines.filter(Boolean).join("\n");
}

