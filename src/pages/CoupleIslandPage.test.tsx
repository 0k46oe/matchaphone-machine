import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { db } from "../core/db";
import CoupleIslandPage from "./CoupleIslandPage";
import type { Character, Conversation, CoupleIsland } from "../core/types";

const t = 1000;
const character = { id: "character", schemaVersion: 1, createdAt: t, updatedAt: t, name: "Chacha", avatar: "", bio: "", personality: "", speakingStyle: "", background: "", language: "中文", proactive: { messages: false, timeAware: false, frequency: "low", quietStart: "23:00", quietEnd: "08:00", catchupLimit: 1, dailyLimit: 1 }, relationship: { intimacy: 1, trust: 1, mood: "calm", recentEvents: [] }, lastActiveAt: t } as Character;
const conversation = { id: "conversation", schemaVersion: 1, createdAt: t, updatedAt: t, type: "private", title: "Chacha", memberIds: [character.id], lastActivityAt: t } as Conversation;
const island = { id: "island", schemaVersion: 1, createdAt: t, updatedAt: t, characterId: character.id, conversationId: conversation.id, status: "active", name: "Our Island", level: 1, experience: 0, heartShells: 20, themeId: "matcha-coast", weather: "sunny", startedAt: t, lastActivityAt: t } as CoupleIsland;

describe("couple island page", () => {
  afterEach(() => cleanup());
  beforeEach(async () => { await db.delete(); await db.open(); await db.characters.add(character); await db.conversations.add(conversation); });

  it("shows invite candidates when there is no island", async () => {
    render(<MemoryRouter><CoupleIslandPage /></MemoryRouter>);
    expect(await screen.findByText("Chacha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "邀请" })).toBeInTheDocument();
  });

  it("always opens on the roster and can enter, return, and re-enter an existing island", async () => {
    await db.coupleIslands.add(island);
    render(<MemoryRouter><CoupleIslandPage /></MemoryRouter>);
    expect(await screen.findByText("角色列表")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "进入" }));
    expect(await screen.findByText("Our Island")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回角色列表" }));
    expect(await screen.findByText("角色列表")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "进入" }));
    await waitFor(() => expect(screen.getByText("Our Island")).toBeInTheDocument());
  });
});
