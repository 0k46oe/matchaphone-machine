export const USER_PERSONA_DRAFT_DB_NAME = "chacha-user-persona-draft-v2";
export const USER_PERSONA_DRAFT_STORE_NAME = "drafts";
export const USER_PERSONA_DRAFT_RECORD_KEY = "current";
export const LEGACY_USER_PERSONA_DRAFT_KEY = "chacha-user-persona-draft-v1";
export const USER_PERSONA_DRAFT_FALLBACK_KEY = "chacha-user-persona-draft-v2";

export interface PersonaDraftV2 {
  version: 2;
  name: string;
  nickname: string;
  bio: string;
  persona: string;
  avatar: string;
  updatedAt: number;
}

type PersonaDraftInput = Omit<PersonaDraftV2, "version"> & { version?: 2 };

function normalizeDraft(value: unknown): PersonaDraftV2 | undefined {
  if (!value || typeof value !== "object") return;
  const draft = value as Partial<PersonaDraftV2>;
  if (
    typeof draft.name !== "string" ||
    typeof draft.nickname !== "string" ||
    typeof draft.bio !== "string" ||
    typeof draft.persona !== "string" ||
    typeof draft.avatar !== "string"
  )
    return;
  return {
    version: 2,
    name: draft.name,
    nickname: draft.nickname,
    bio: draft.bio,
    persona: draft.persona,
    avatar: draft.avatar,
    updatedAt: Number(draft.updatedAt) || Date.now(),
  };
}

function readLocalDraft(key: string) {
  try {
    return normalizeDraft(JSON.parse(localStorage.getItem(key) ?? ""));
  } catch {
    return undefined;
  }
}

function writeLocalDraft(draft: PersonaDraftV2) {
  localStorage.setItem(USER_PERSONA_DRAFT_FALLBACK_KEY, JSON.stringify(draft));
}

function openDraftDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const request = indexedDB.open(USER_PERSONA_DRAFT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(USER_PERSONA_DRAFT_STORE_NAME))
        request.result.createObjectStore(USER_PERSONA_DRAFT_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open persona draft storage"));
  });
}

async function readIndexedDraft() {
  const database = await openDraftDb();
  try {
    return await new Promise<PersonaDraftV2 | undefined>((resolve, reject) => {
      const transaction = database.transaction(USER_PERSONA_DRAFT_STORE_NAME, "readonly");
      const request = transaction.objectStore(USER_PERSONA_DRAFT_STORE_NAME).get(USER_PERSONA_DRAFT_RECORD_KEY);
      request.onsuccess = () => resolve(normalizeDraft(request.result));
      request.onerror = () => reject(request.error ?? new Error("Unable to read persona draft"));
    });
  } finally {
    database.close();
  }
}

async function writeIndexedDraft(draft: PersonaDraftV2) {
  const database = await openDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(USER_PERSONA_DRAFT_STORE_NAME, "readwrite");
      transaction.objectStore(USER_PERSONA_DRAFT_STORE_NAME).put(draft, USER_PERSONA_DRAFT_RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save persona draft"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Unable to save persona draft"));
    });
  } finally {
    database.close();
  }
}

async function deleteIndexedDraft() {
  const database = await openDraftDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(USER_PERSONA_DRAFT_STORE_NAME, "readwrite");
      transaction.objectStore(USER_PERSONA_DRAFT_STORE_NAME).delete(USER_PERSONA_DRAFT_RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to clear persona draft"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Unable to clear persona draft"));
    });
  } finally {
    database.close();
  }
}

export function createPersonaDraft(input: PersonaDraftInput): PersonaDraftV2 {
  return { ...input, version: 2 };
}

export async function readPersonaDraft(): Promise<PersonaDraftV2 | undefined> {
  const legacy = readLocalDraft(LEGACY_USER_PERSONA_DRAFT_KEY),
    fallback = readLocalDraft(USER_PERSONA_DRAFT_FALLBACK_KEY);
  let indexed: PersonaDraftV2 | undefined;
  try {
    indexed = await readIndexedDraft();
  } catch {
    indexed = undefined;
  }
  const draft = [legacy, fallback, indexed]
    .filter((item): item is PersonaDraftV2 => Boolean(item))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!draft) return;
  try {
    await writeIndexedDraft(draft);
    localStorage.removeItem(USER_PERSONA_DRAFT_FALLBACK_KEY);
    localStorage.removeItem(LEGACY_USER_PERSONA_DRAFT_KEY);
  } catch {
    try {
      writeLocalDraft(draft);
    } catch {}
  }
  return draft;
}

export async function writePersonaDraft(input: PersonaDraftInput) {
  const draft = createPersonaDraft(input);
  try {
    await writeIndexedDraft(draft);
    localStorage.removeItem(USER_PERSONA_DRAFT_FALLBACK_KEY);
    localStorage.removeItem(LEGACY_USER_PERSONA_DRAFT_KEY);
  } catch {
    writeLocalDraft(draft);
  }
}

export async function clearPersonaDraft() {
  try {
    await deleteIndexedDraft();
  } catch {}
  try {
    localStorage.removeItem(USER_PERSONA_DRAFT_FALLBACK_KEY);
    localStorage.removeItem(LEGACY_USER_PERSONA_DRAFT_KEY);
  } catch {}
}
