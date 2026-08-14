import { beforeEach, describe, expect, it } from "vitest";
import { createBackup, restoreBackup } from "./backup";
import { db } from "./db";
import { deleteLoreShelfGroup, ensureLoreShelfGroup, getLoreShelfGroups, renameLoreShelfGroup } from "./loreShelfGroups";

const book = (id: string, shelfGroupId?: string) => ({
  id,
  schemaVersion: 1,
  createdAt: 1,
  updatedAt: 1,
  name: id,
  description: "",
  entries: [],
  enabled: true,
  mount: { mode: "none", characterIds: [], conversationIds: [] },
  shelfGroupId,
  triggerSettings: { defaultScanDepth: 20, maxContextChars: 3000 },
} as any);

describe("lore shelf groups", () => {
  beforeEach(async () => { await db.delete(); await db.open(); });

  it("creates stable custom shelves and moves books to ungrouped when a shelf is deleted", async () => {
    const group = await ensureLoreShelfGroup("  雨天   设定  ");
    expect((await ensureLoreShelfGroup("雨天 设定")).id).toBe(group.id);
    await db.loreBooks.bulkAdd([book("grouped", group.id), book("ungrouped")]);
    await renameLoreShelfGroup(group.id, "夜航");
    expect((await getLoreShelfGroups())[0]).toMatchObject({ id: group.id, name: "夜航", order: 0 });
    await deleteLoreShelfGroup(group.id);
    expect(await getLoreShelfGroups()).toEqual([]);
    expect((await db.loreBooks.get("grouped"))?.shelfGroupId).toBeUndefined();
    expect(await db.loreBooks.get("ungrouped")).toBeTruthy();
  });

  it("includes shelf definitions and book assignments in ordinary backup restore", async () => {
    const group = await ensureLoreShelfGroup("角色设定");
    await db.loreBooks.add(book("book", group.id));
    const backup = await createBackup();
    expect(backup.data.loreShelfGroups).toEqual([expect.objectContaining({ id: group.id, name: "角色设定" })]);
    await db.loreBooks.clear();
    await db.settings.clear();
    await restoreBackup(backup);
    expect((await getLoreShelfGroups())[0]).toMatchObject({ id: group.id, name: "角色设定" });
    expect((await db.loreBooks.get("book"))?.shelfGroupId).toBe(group.id);
  });
});
