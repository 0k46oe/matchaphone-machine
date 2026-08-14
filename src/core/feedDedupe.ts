import type {FeedPost} from "./types";

const decorative=/[\s\p{P}\p{S}\u200B-\u200D\uFEFF]+/gu;
export function normalizeFeedContent(value:string){return value.normalize("NFKC").toLocaleLowerCase().replace(decorative,"").trim();}
function grams(value:string,size=2){const result=new Set<string>();if(value.length<=size){if(value)result.add(value);return result;}for(let index=0;index<=value.length-size;index++)result.add(value.slice(index,index+size));return result;}
function editSimilarity(left:string,right:string){const a=normalizeFeedContent(left),b=normalizeFeedContent(right);if(!a&&!b)return 1;if(!a||!b)return 0;let previous=Array.from({length:b.length+1},(_,index)=>index);for(let row=1;row<=a.length;row++){const current=[row];for(let column=1;column<=b.length;column++)current[column]=Math.min(current[column-1]+1,previous[column]+1,previous[column-1]+(a[row-1]===b[column-1]?0:1));previous=current}return 1-previous[b.length]/Math.max(a.length,b.length)}
export function feedContentSimilarity(left:string,right:string){const a=grams(normalizeFeedContent(left)),b=grams(normalizeFeedContent(right));if(!a.size&&!b.size)return 1;if(!a.size||!b.size)return 0;let intersection=0;for(const token of a)if(b.has(token))intersection++;return Math.max((2*intersection)/(a.size+b.size),editSimilarity(left,right));}
export function duplicateFeedPost(content:string,posts:FeedPost[],authorId:string){
  const normalized=normalizeFeedContent(content);if(!normalized)return undefined;
  const own=posts.filter(post=>(post.authorType??"character")==="character"&&post.authorId===authorId&&post.origin==="proactive").sort((a,b)=>b.createdAt-a.createdAt);
  const exact=own.find(post=>normalizeFeedContent(post.content)===normalized);if(exact)return{post:exact,kind:"exact" as const,similarity:1};
  if(normalized.length<8)return undefined;
  for(const post of own.slice(0,30)){const similarity=feedContentSimilarity(content,post.content),other=normalizeFeedContent(post.content);const threshold=Math.min(normalized.length,other.length)<16?.92:.86;if(similarity>=threshold)return{post,kind:"similar" as const,similarity};}
  return undefined;
}
