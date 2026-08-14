import {describe,expect,it} from "vitest";
import {canCharacterInteract,conversationChatSettingsOf,conversationDisplayName,isCharacterBlocked,resolvedConversationBubble} from "./conversationSettings";
import type {Character,Conversation} from "./types";

const conversation={id:"c",schemaVersion:1,createdAt:1,updatedAt:1,title:"原名",type:"private",memberIds:["a"],presetIds:[],loreBookIds:[],lastActivityAt:1} as Conversation;
const character={id:"a",name:"角色"} as Character;

describe("conversation settings",()=>{
  it("normalizes old conversations",()=>{expect(conversationChatSettingsOf(conversation)).toMatchObject({bubbleStyle:"inherit",characterAvatarSize:36,fontScale:92,autoTranslate:true,notifications:{messages:true,calls:true,previewContent:"inherit"}});});
  it("uses a private remark only for UI",()=>{expect(conversationDisplayName({...conversation,chatSettings:{...conversationChatSettingsOf(conversation),remark:"备注"}},character)).toBe("备注");expect(character.name).toBe("角色")});
  it("resolves inherited bubbles and block state",()=>{expect(resolvedConversationBubble(conversation,"kawaii")).toBe("kawaii");expect(isCharacterBlocked({...character,contactState:{status:"blocked"}})).toBe(true);expect(isCharacterBlocked({...character,contactState:{status:"not-added"}})).toBe(false);expect(canCharacterInteract({...character,contactState:{status:"not-added"}})).toBe(false);expect(canCharacterInteract({...character,contactState:{status:"friend"}})).toBe(true)});
  it("preserves a supported per-conversation chat background",()=>{const value=conversationChatSettingsOf({...conversation,chatSettings:{...conversationChatSettingsOf(conversation),chatBackground:{type:"asset",value:"bg-1"}}});expect(value.chatBackground).toEqual({type:"asset",value:"bg-1"})});
  it("normalizes conversation model and translation settings",()=>{const value=conversationChatSettingsOf({...conversation,chatSettings:{...conversationChatSettingsOf(conversation),providerPresetId:" preset ",autoTranslate:false}});expect(value.providerPresetId).toBe("preset");expect(value.autoTranslate).toBe(false)});
});
