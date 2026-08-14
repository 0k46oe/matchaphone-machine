import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RichMessageContent } from "./ChatMedia";
import { db } from "../core/db";
import type { Message, MusicTrack } from "../core/types";
const track = { id: "track", schemaVersion: 1, createdAt: 1, updatedAt: 1, importedAt: 1, source: "direct-url", title: "晚风", artists: ["茶茶"], directUrl: "https://example.com/a.mp3" } as MusicTrack;
const message = { id: "message", schemaVersion: 1, createdAt: 1, updatedAt: 1, conversationId: "conversation", senderType: "character", senderId: "character", content: "邀请一起听", kind: "music-invitation", status: "complete", attachments: [{ type: "music-invitation", sessionId: "session", characterId: "character", state: "pending", trackId: track.id }] } as Message;
describe("chat music invitation card", () => {
  beforeEach(async () => { await db.delete(); await db.open(); await db.musicTracks.add(track); });
  it("shows the real song and lets the user accept", async () => {
    const respond = vi.fn(async () => {});
    render(<MemoryRouter><RichMessageContent message={message} assets={new Map()} onMusicInvitationResponse={respond} /></MemoryRouter>);
    expect(await screen.findByText("晚风")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "接受" }));
    await waitFor(() => expect(respond).toHaveBeenCalledWith("message", true));
    expect(screen.getByText(/已接受/)).toBeInTheDocument();
  });
});

  it("renders DJ candidates and session summaries", async () => {
    await db.musicTracks.bulkPut([
      { ...track, id: "candidate", title: "雨夜" },
      { ...track, id: "summary-track", title: "晴天" },
    ]);
    const candidateMessage = { ...message, id: "candidate-message", kind: "music-search-candidates", content: "候选", attachments: [{ type: "music-search-candidates", sessionId: "session", characterId: "character", query: "雨天", trackIds: ["candidate"], placement: "next", state: "selected", selectedTrackId: "candidate" }] } as Message;
    const { unmount } = render(<MemoryRouter><RichMessageContent message={candidateMessage} assets={new Map()} /></MemoryRouter>);
    expect(await screen.findByText("雨夜")).toBeInTheDocument();
    expect(screen.getByText("已加入播放队列")).toBeInTheDocument();
    unmount();
    const summaryMessage = { ...message, id: "summary", kind: "music-session-summary", content: "小结", senderType: "system", attachments: [{ type: "music-session-summary", sessionId: "session", characterId: "character", trackIds: ["summary-track"], listenedMs: 620000, representativeTrackId: "summary-track", closingNote: "下次还想陪你听。" }] } as Message;
    render(<MemoryRouter><RichMessageContent message={summaryMessage} assets={new Map()} /></MemoryRouter>);
    expect(await screen.findByText("晴天")).toBeInTheDocument();
    expect(screen.getByText("下次还想陪你听。")).toBeInTheDocument();
  });
