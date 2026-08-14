export function feedGridClass(count:number){
 const safe=Math.max(1,Math.min(9,Math.trunc(Number.isFinite(count)?count:1)));
 return `count-${safe}`;
}

export function pendingInteractionLabel(count:number){
 const safe=Math.max(0,Math.min(10,Math.trunc(Number.isFinite(count)?count:0)));
 return safe?`角色正在赶来 · ${safe}`:"";
}