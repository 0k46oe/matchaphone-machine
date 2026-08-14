import type { Message, MessageAttachment } from "./types";

const ORDINARY_MEDIA_ATTACHMENT_TYPES = new Set<MessageAttachment["type"]>([
  "sticker",
  "image",
  "text-image",
  "voice",
]);

export function isCardOnlyMessage(
  message: Pick<Message, "attachments">,
): boolean {
  return (
    message.attachments?.some(
      (attachment) => !ORDINARY_MEDIA_ATTACHMENT_TYPES.has(attachment.type),
    ) ?? false
  );
}
