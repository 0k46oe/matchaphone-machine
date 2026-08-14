import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import {
  LEGACY_USER_PERSONA_DRAFT_KEY,
  USER_PERSONA_DRAFT_DB_NAME,
  clearPersonaDraft,
  createPersonaDraft,
  readPersonaDraft,
  writePersonaDraft,
} from "./userPersonaDraft";

async function deleteDraftDb() {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(USER_PERSONA_DRAFT_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

describe("user persona draft storage", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearPersonaDraft();
    await deleteDraftDb();
  });

  it("persists the latest complete snapshot outside the app Dexie database", async () => {
    const draft = createPersonaDraft({
      name: "小茶",
      nickname: "茶茶",
      bio: "两行\n简介",
      persona: "完整人设",
      avatar: "data:image/png;base64,avatar",
      updatedAt: 123,
    });
    await writePersonaDraft(draft);
    await expect(readPersonaDraft()).resolves.toEqual(draft);
  });

  it("migrates the legacy localStorage draft without losing fields", async () => {
    localStorage.setItem(
      LEGACY_USER_PERSONA_DRAFT_KEY,
      JSON.stringify({
        name: "旧名称",
        nickname: "旧昵称",
        bio: "旧简介",
        persona: "旧人设",
        avatar: "old-avatar",
        updatedAt: 456,
      }),
    );
    const draft = await readPersonaDraft();
    expect(draft).toMatchObject({
      version: 2,
      name: "旧名称",
      nickname: "旧昵称",
      bio: "旧简介",
      persona: "旧人设",
      avatar: "old-avatar",
      updatedAt: 456,
    });
    expect(localStorage.getItem(LEGACY_USER_PERSONA_DRAFT_KEY)).toBeNull();
  });

  it("clears saved drafts only when explicitly requested", async () => {
    await writePersonaDraft(
      createPersonaDraft({
        name: "我",
        nickname: "我",
        bio: "",
        persona: "保留内容",
        avatar: "",
        updatedAt: 1,
      }),
    );
    expect(await readPersonaDraft()).toBeTruthy();
    await clearPersonaDraft();
    expect(await readPersonaDraft()).toBeUndefined();
  });
});
