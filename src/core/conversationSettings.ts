import type {AppearanceChatBubbleStyle,Character,Conversation,ConversationChatSettings} from "./types";

export const DEFAULT_CONVERSATION_CHAT_SETTINGS:ConversationChatSettings={
  bubbleStyle:"inherit",
  characterAvatarSize:36,
  fontScale:92,
  autoTranslate:true,
  groupInnerVoiceEnabled:true,
  permissions:{
    proactiveChatImage:false,
    proactiveVoiceCall:false,
    proactiveVideoCall:false,
    proactiveMeetInvitation:false,
    proactiveSticker:false,
  },
  proactiveStickerPackIds:[],
  userInGroup:true,
  notifications:{messages:true,calls:true,previewContent:"inherit"},
};

export function conversationChatSettingsOf(conversation?:Conversation|null,character?:Character|null):ConversationChatSettings{
  const source=conversation?.chatSettings;
  return {
    remark:source?.remark?.trim().slice(0,30)||undefined,
    bubbleStyle:source?.bubbleStyle??"inherit",
    chatBackground:source?.chatBackground?.type==="asset"||source?.chatBackground?.type==="url"?source.chatBackground:undefined,
    characterAvatarSize:Math.max(24,Math.min(56,source?.characterAvatarSize??36)),
    fontScale:Math.max(85,Math.min(135,source?.fontScale??92)),
    providerPresetId:source?.providerPresetId?.trim()||undefined,
    autoTranslate:source?.autoTranslate??true,
    groupInnerVoiceEnabled:source?.groupInnerVoiceEnabled??true,
    permissions:{
      proactiveChatImage:source?.permissions?.proactiveChatImage??false,
      proactiveVoiceCall:source?.permissions?.proactiveVoiceCall??false,
      proactiveVideoCall:source?.permissions?.proactiveVideoCall??false,
      proactiveMeetInvitation:source?.permissions?.proactiveMeetInvitation??character?.chatSettings?.meetInvitations?.enabled??false,
      proactiveSticker:source?.permissions?.proactiveSticker??false,
    },
    proactiveStickerPackIds:[...new Set(source?.proactiveStickerPackIds??[])],
    userInGroup:source?.userInGroup??true,
    notifications:{messages:source?.notifications?.messages??true,calls:source?.notifications?.calls??true,previewContent:source?.notifications?.previewContent??"inherit"},
  };
}

export function conversationDisplayName(conversation:Conversation,character?:Character|null){
  const remark=conversation.type==="private"?conversationChatSettingsOf(conversation).remark:undefined;
  return remark||conversation.title||character?.name||"聊天";
}

export function resolvedConversationBubble(conversation:Conversation,global:AppearanceChatBubbleStyle):AppearanceChatBubbleStyle{
  const bubble=conversationChatSettingsOf(conversation).bubbleStyle;
  return bubble==="inherit"?global:bubble;
}

export function contactStatusOf(character?:Character|null){return character?.contactState?.status??"friend"}
export function isCharacterBlocked(character?:Character|null){return contactStatusOf(character)==="blocked"}
export function canCharacterInteract(character?:Character|null){return contactStatusOf(character)==="friend"}
