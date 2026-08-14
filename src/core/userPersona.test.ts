import {beforeEach,describe,expect,it} from "vitest";
import {createBackup,restoreBackup} from "./backup";
import {buildContext} from "./context";
import {db,getAppSettings,setSetting} from "./db";
import {defaultAppSettings,defaultProvider,type Character,type Conversation} from "./types";
import {userNicknameOf,userPersonaContext,USER_PERSONA_MAX_LENGTH} from "./userPersona";
import {meetInvitationPrompt} from "./meetService";

const character={id:"c",schemaVersion:1,createdAt:1,updatedAt:1,name:"茶茶",avatar:"",bio:"",personality:"温柔",speakingStyle:"自然",background:"",language:"中文",proactive:{messages:false,timeAware:false,frequency:"low",quietStart:"23:00",quietEnd:"08:00",catchupLimit:1,dailyLimit:1},relationship:{intimacy:10,trust:20,mood:"平静",recentEvents:[]},lastActiveAt:1} as Character;
const conversation:Conversation={id:"v",schemaVersion:1,createdAt:1,updatedAt:1,title:"茶茶",type:"private",memberIds:["c"],presetIds:[],loreBookIds:[],lastActivityAt:1};

describe("single user persona",()=>{
 beforeEach(async()=>{await db.delete();await db.open()});
 it("uses the optional nickname only as a UI fallback helper",()=>{expect(userNicknameOf({userName:"Real",userNickname:"Nick"})).toBe("Nick");expect(userNicknameOf({userName:"Real"})).toBe("Real")});
 it("omits an empty persona and caps the editor length",()=>{expect(userPersonaContext({...defaultAppSettings,userName:"我"})).toBe("");expect(USER_PERSONA_MAX_LENGTH).toBe(8000)});
 it("renders identity and anti-impersonation rules into chat context",()=>{const settings={...defaultAppSettings,userName:"小满",userBio:"旅行摄影师",userPersona:"在海边长大，慢热但很真诚。"},system=buildContext({character,conversation,messages:[],loreBooks:[],memories:[],userText:"你好",settings,provider:defaultProvider})[0].content;expect(system).toContain("用户名称：小满");expect(system).toContain("旅行摄影师");expect(system).toContain("在海边长大");expect(system).toContain("主动理解并抓取");expect(system).toContain("偏好、边界、关系定位");expect(system).toContain("不得补写用户人设中没有提供的心理、感受、行动")});
 it("injects the latest persona into character meet invitations",()=>{const prompt=meetInvitationPrompt({character,userText:"周末要不要见面",replyText:"那我们去海边走走吧",appSettings:{...defaultAppSettings,userName:"小满",userBio:"旅行摄影师",userPersona:"在海边长大，怕拥挤的地方。"}});expect(prompt).toContain("用户名称：小满");expect(prompt).toContain("旅行摄影师");expect(prompt).toContain("怕拥挤的地方");expect(prompt).toContain("不得替用户决定行动");expect(prompt).toContain("不得暴露人物设定")});
 it("round trips the persona through backup and restore",async()=>{await setSetting("app",{...defaultAppSettings,onboarded:true,userName:"小满",userBio:"简介",userPersona:"唯一的人物设定"});const backup=await createBackup();await setSetting("app",{...defaultAppSettings,onboarded:true,userName:"另一个名字"});await restoreBackup(backup);expect(await getAppSettings()).toMatchObject({userName:"小满",userBio:"简介",userPersona:"唯一的人物设定"})});
});
