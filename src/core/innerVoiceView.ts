import { forumHandleOf } from "./forum";
import type { ForumServer, Message } from "./types";

export type InnerVoiceActorType = "character" | "npc";

export function selectInnerVoiceMessages(
  messages: Message[],
  conversationId: string,
  actorType: InnerVoiceActorType,
  actorId: string,
) {
  return messages
    .filter(
      (message) =>
        message.conversationId === conversationId &&
        message.innerVoice?.actorType === actorType &&
        message.innerVoice.actorId === actorId,
    )
    .sort(
      (a, b) =>
        (b.innerVoice?.createdAt ?? b.createdAt) -
        (a.innerVoice?.createdAt ?? a.createdAt),
    );
}

export function innerVoiceTurnMessages(messages: Message[], message: Message) {
  const speakerTurnId = message.innerVoice?.speakerTurnId;
  if (!speakerTurnId) return [];
  return messages
    .filter(
      (item) =>
        item.conversationId === message.conversationId &&
        item.generation?.speakerTurnId === speakerTurnId,
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

const normalizedHandle = (value?: string) => {
  const clean = value?.trim();
  if (!clean) return undefined;
  return clean.startsWith("@") ? clean : `@${clean}`;
};

export function resolveInnerVoiceForumHandle(input: {
  actorType: InnerVoiceActorType;
  actorId: string;
  actorName: string;
  servers: ForumServer[];
}) {
  const key = `${input.actorType}:${input.actorId}`;
  const customized = input.servers
    .map((server) => server.memberProfiles?.[key])
    .filter((profile) => Boolean(profile?.handle))
    .sort((a, b) => (b?.updatedAt ?? 0) - (a?.updatedAt ?? 0))[0];
  const customizedHandle = normalizedHandle(customized?.handle);
  if (customizedHandle) return customizedHandle;

  if (input.actorType === "character")
    return forumHandleOf(input.actorName, input.actorId);

  const configured = input.servers
    .flatMap((server) =>
      (server.npcs ?? [])
        .filter((npc) => npc.id === input.actorId)
        .map((npc) => ({ npc, serverUpdatedAt: server.updatedAt })),
    )
    .sort(
      (a, b) =>
        (b.npc.updatedAt ?? b.serverUpdatedAt) -
        (a.npc.updatedAt ?? a.serverUpdatedAt),
    )[0]?.npc;
  if (!configured) return undefined;
  return normalizedHandle(configured.handle) ?? forumHandleOf(configured.name, configured.id);
}
