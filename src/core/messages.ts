import { db } from "./db";
import { pauseActiveMeetForOnlineActivity } from "./crossModeContinuity";
import {
  now,
  SCHEMA_VERSION,
  uid,
  type Character,
  type Conversation,
  type Message,
} from "./types";

export async function refreshConversationActivity(conversation: Conversation) {
  const latest = await db.messages
    .where("conversationId")
    .equals(conversation.id)
    .reverse()
    .sortBy("createdAt");
  const stamp = latest[0]?.createdAt ?? conversation.createdAt;
  await db.conversations.update(conversation.id, {
    lastActivityAt: stamp,
    updatedAt: now(),
  });
}

function forwardedMessageContent(message: Message) {
  const sticker = message.attachments?.find(
    (attachment) => attachment.type === "sticker",
  );
  if (sticker?.type === "sticker")
    return `[表情包] ${sticker.description || sticker.name}`;
  const textImage = message.attachments?.find(
    (attachment) => attachment.type === "text-image",
  );
  return `${message.content}${
    textImage?.type === "text-image"
      ? `\n[文字图片：${textImage.description}]`
      : ""
  }`;
}

export function formatForward(
  messages: Message[],
  characters: Character[],
  userName = "我",
  sourceConversation?: Conversation,
) {
  const ordered = [...messages].sort((a, b) => a.createdAt - b.createdAt);
  return [
    `【转发的聊天记录 · ${new Date().toLocaleString("zh-CN")}】`,
    ...ordered.map((message) => {
      const name =
        message.senderType === "user"
          ? userName
          : (characters.find((character) => character.id === message.senderId)
              ?.name ??
            sourceConversation?.groupNpcs?.find(
              (npc) => npc.id === message.senderId,
            )?.name ??
            "成员");
      return `${name}：${forwardedMessageContent(message)}`;
    }),
  ].join("\n\n");
}

export async function forwardMessages(
  target: Conversation,
  selected: Message[],
  characters: Character[],
  userName = "我",
  sourceConversation?: Conversation,
) {
  const t = now(),
    message: Message = {
      id: uid(),
      schemaVersion: SCHEMA_VERSION,
      createdAt: t,
      updatedAt: t,
      conversationId: target.id,
      senderType: "user",
      content: formatForward(
        selected,
        characters,
        userName,
        sourceConversation,
      ),
      status: "complete",
    };
  await db.transaction(
    "rw",
    [db.messages, db.conversations, db.meetSessions],
    async () => {
      await pauseActiveMeetForOnlineActivity(target.id, t);
      await db.messages.add(message);
      await db.conversations.update(target.id, {
        lastActivityAt: t,
        updatedAt: t,
      });
    },
  );
  return message;
}
