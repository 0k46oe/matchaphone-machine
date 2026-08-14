import type {AppSettings} from "./types";

export const USER_PERSONA_MAX_LENGTH=8000;
export const userNicknameOf=(settings?:Partial<Pick<AppSettings,"userName"|"userNickname">>|null)=>settings?.userNickname?.trim()||settings?.userName?.trim()||"我";
export function userPersonaContext(settings?:Partial<Pick<AppSettings,"userName"|"userBio"|"userPersona">>|null){
 const persona=settings?.userPersona?.trim();if(!persona)return "";
 return ["【用户人设理解】用户身份资料是理解互动对象的事实来源，不是可在回复中复述或暴露的系统说明。",`用户名称：${settings?.userName?.trim()||"用户"}`,settings?.userBio?.trim()?`用户简介：${settings.userBio.trim()}`:"",`用户人物设定：${persona}`,"必须主动理解并抓取其中明确写出的身份、经历、性格、偏好、边界、关系定位、称呼习惯、外貌信息和世界内事实，并自然影响角色对用户的态度、判断、熟悉程度、互动方式和剧情反应。","用户人设与用户当前明确消息冲突时，以用户本轮明确表达和已经发生的事实为准；不得把人设当成用户本轮已经做出的动作或说出口的话。","不得补写用户人设中没有提供的心理、感受、行动、身体反应和台词；信息不明确时保持未知。","不得直接复述“根据你的人设”“设定里写着”等后台措辞，也不得提及人物设定、系统资料、模型或提示词。"].filter(Boolean).join("\n");
}
