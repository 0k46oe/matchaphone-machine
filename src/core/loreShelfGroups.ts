import { db, getSetting, setSetting } from "./db";
import { now, uid, type LoreShelfGroup } from "./types";

export const LORE_SHELF_GROUPS_KEY = "lore-shelf-groups";

function normalizedName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 30);
}

function normalizeGroups(raw: unknown): LoreShelfGroup[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .filter((item): item is Partial<LoreShelfGroup> => Boolean(item && typeof item === "object"))
    .map((item, index) => {
      const name = normalizedName(String(item.name ?? ""));
      const createdAt = Number.isFinite(item.createdAt) ? Number(item.createdAt) : now();
      return {
        id: typeof item.id === "string" && item.id ? item.id : uid(),
        name,
        order: Number.isFinite(item.order) ? Number(item.order) : index,
        createdAt,
        updatedAt: Number.isFinite(item.updatedAt) ? Number(item.updatedAt) : createdAt,
      };
    })
    .filter((item) => {
      const key = item.name.toLocaleLowerCase();
      if (!item.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export async function getLoreShelfGroups() {
  return normalizeGroups(await getSetting<unknown>(LORE_SHELF_GROUPS_KEY, []));
}

export async function saveLoreShelfGroups(groups: LoreShelfGroup[]) {
  const normalized = normalizeGroups(groups).map((group, order) => ({ ...group, order }));
  await setSetting(LORE_SHELF_GROUPS_KEY, normalized);
  return normalized;
}

export async function ensureLoreShelfGroup(name: string) {
  const clean = normalizedName(name);
  if (!clean) throw new Error("请输入分组名称");
  const groups = await getLoreShelfGroups();
  const existing = groups.find((group) => group.name.localeCompare(clean, undefined, { sensitivity: "accent" }) === 0);
  if (existing) return existing;
  const at = now();
  const group: LoreShelfGroup = { id: uid(), name: clean, order: groups.length, createdAt: at, updatedAt: at };
  await saveLoreShelfGroups([...groups, group]);
  return group;
}

export async function renameLoreShelfGroup(id: string, name: string) {
  const clean = normalizedName(name);
  if (!clean) throw new Error("请输入分组名称");
  const groups = await getLoreShelfGroups();
  if (groups.some((group) => group.id !== id && group.name.localeCompare(clean, undefined, { sensitivity: "accent" }) === 0)) throw new Error("已经存在同名分组");
  const at = now(), next = groups.map((group) => group.id === id ? { ...group, name: clean, updatedAt: at } : group);
  await saveLoreShelfGroups(next);
  return next.find((group) => group.id === id);
}

export async function deleteLoreShelfGroup(id: string) {
  const groups = await getLoreShelfGroups();
  await db.transaction("rw", [db.settings, db.loreBooks], async () => {
    await db.loreBooks.where("updatedAt").aboveOrEqual(0).filter((book) => book.shelfGroupId === id).modify({ shelfGroupId: undefined, updatedAt: now() });
    await db.settings.put({ key: LORE_SHELF_GROUPS_KEY, value: groups.filter((group) => group.id !== id).map((group, order) => ({ ...group, order })) });
  });
}

export function loreShelfGroupName(groups: LoreShelfGroup[], groupId?: string) {
  return groups.find((group) => group.id === groupId)?.name ?? "未分组";
}
