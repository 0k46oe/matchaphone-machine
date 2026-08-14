import type {Character,Memory} from "./types";

export const clampRelationshipValue=(value:number)=>Math.max(0,Math.min(100,Math.round(Number.isFinite(value)?value:0)));
export function relationshipStage(intimacy:number,trust:number){
 const score=Math.round((clampRelationshipValue(intimacy)+clampRelationshipValue(trust))/2);
 if(score>=80)return{score,label:"深度羁绊",description:"彼此已经建立稳定而深厚的陪伴关系。"};
 if(score>=60)return{score,label:"相互信赖",description:"关系稳定，角色会更自然地表达依赖与信任。"};
 if(score>=40)return{score,label:"逐渐亲近",description:"相处正在变得熟悉，角色会展现更多真实想法。"};
 if(score>=20)return{score,label:"开始熟悉",description:"已经留下共同经历，但仍需要更多相处。"};
 return{score,label:"初次相识",description:"关系仍在建立中，角色会保持适度距离。"};
}
export function relationshipMetricLabel(kind:"intimacy"|"trust",value:number){
 const score=clampRelationshipValue(value);
 if(kind==="intimacy")return score>=75?"深厚":score>=50?"亲近":score>=25?"熟悉":"疏远";
 return score>=75?"坚定":score>=50?"信任":score>=25?"观察":"戒备";
}
export function applyRelationship(c:Character,event:{kind:"positive"|"negative"|"neutral";importance:number;label:string}){const sign=event.kind==="positive"?1:event.kind==="negative"?-1:0,delta=Math.min(4,Math.max(0,event.importance))*sign;return{...c,relationship:{...c.relationship,intimacy:clampRelationshipValue(c.relationship.intimacy+delta),trust:clampRelationshipValue(c.relationship.trust+(event.kind==="negative"?delta:Math.ceil(delta/2))),recentEvents:[event.label,...c.relationship.recentEvents].slice(0,8)}}}
export function mergeMemories(items:Memory[]){const seen=new Map<string,Memory>();for(const m of items){const key=`${m.characterId}:${m.kind}:${m.content.trim().toLowerCase()}`;const old=seen.get(key);if(!old||m.locked||m.importance>old.importance)seen.set(key,m)}return [...seen.values()]}
export function inQuietHours(now:Date,start:string,end:string){const mins=now.getHours()*60+now.getMinutes(),parse=(s:string)=>{const [h,m]=s.split(":").map(Number);return h*60+m},a=parse(start),b=parse(end);return a<=b?mins>=a&&mins<b:mins>=a||mins<b}
export function proactiveAllowance(c:Character,generatedToday:number){if(!c.proactive.messages||!c.proactive.timeAware||inQuietHours(new Date(),c.proactive.quietStart,c.proactive.quietEnd))return 0;return Math.max(0,Math.min(c.proactive.catchupLimit,c.proactive.dailyLimit-generatedToday))}
