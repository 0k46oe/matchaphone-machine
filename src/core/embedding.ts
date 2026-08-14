import { db, getSetting, setSetting } from "./db";
import { memoryContentHash, selectMemories } from "./memory";
import { sanitizeApiErrorText } from "./provider";
import {
  defaultEmbeddingServiceSettings,
  now,
  type EmbeddingServiceSettings,
  type Memory,
  type MemoryVector,
} from "./types";

export interface EmbeddingConnectionResult {
  dimensions: number;
  mode: "configured" | "without-dimensions" | "scalar-input";
  warning?: string;
}

class EmbeddingHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "EmbeddingHttpError";
  }
}

export async function getEmbeddingSettings() {
  return {
    ...defaultEmbeddingServiceSettings,
    ...(await getSetting<EmbeddingServiceSettings>(
      "embedding-service",
      defaultEmbeddingServiceSettings,
    )),
  };
}

export async function saveEmbeddingSettings(value: EmbeddingServiceSettings) {
  await setSetting("embedding-service", value);
  return value;
}

export function embeddingEndpoint(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  return /\/embeddings$/i.test(normalized)
    ? normalized
    : `${normalized}/embeddings`;
}

function embeddingErrorDetail(raw: string, apiKey: string) {
  let detail: unknown = raw;
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: unknown; code?: unknown; type?: unknown } | string;
      message?: unknown;
      detail?: unknown;
    };
    if (typeof parsed.error === "string") detail = parsed.error;
    else if (parsed.error && typeof parsed.error === "object") {
      detail =
        parsed.error.message ?? parsed.error.code ?? parsed.error.type ?? parsed.error;
    } else detail = parsed.message ?? parsed.detail ?? parsed;
  } catch {
    // Plain text and HTML errors are sanitized below.
  }
  return sanitizeApiErrorText(detail, [apiKey]) || "\u670d\u52a1\u672a\u8fd4\u56de\u9519\u8bef\u8be6\u60c5";
}

function embeddingFailureMessage(status: number, detail: string) {
  if (status === 401 || status === 403)
    return `Embedding API \u9274\u6743\u5931\u8d25\uff1a${detail}`;
  if (status === 404)
    return `Embedding API \u8def\u5f84\u6216\u6a21\u578b\u4e0d\u5b58\u5728\uff1a${detail}`;
  if (status === 400 || status === 422)
    return `Embedding API \u8bf7\u6c42\u683c\u5f0f\u6216\u6a21\u578b\u53c2\u6570\u4e0d\u517c\u5bb9\uff1a${detail}`;
  if (status === 429) return `Embedding API \u8bf7\u6c42\u8fc7\u4e8e\u9891\u7e41\u6216\u989d\u5ea6\u4e0d\u8db3\uff1a${detail}`;
  if (status >= 500) return `Embedding API \u670d\u52a1\u6682\u65f6\u5f02\u5e38\uff1a${detail}`;
  return `Embedding API \u8bf7\u6c42\u5931\u8d25\uff08${status}\uff09\uff1a${detail}`;
}

type EmbeddingInput = string | string[];

async function requestEmbeddings(
  input: EmbeddingInput,
  config: EmbeddingServiceSettings,
  includeDimensions: boolean,
) {
  let response: Response;
  try {
    response = await fetch(embeddingEndpoint(config.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        input,
        ...(includeDimensions && config.dimensions
          ? { dimensions: config.dimensions }
          : {}),
      }),
    });
  } catch (error) {
    const detail = sanitizeApiErrorText(
      error instanceof Error ? error.message : error,
      [config.apiKey],
    );
    throw new Error(
      `Embedding API \u7f51\u7edc\u6216\u8de8\u57df\u8bf7\u6c42\u5931\u8d25\uff1a${detail || "\u8bf7\u68c0\u67e5\u7f51\u7edc\u3001\u8bc1\u4e66\u548c\u6d4f\u89c8\u5668 CORS \u652f\u6301"}`,
    );
  }

  const text = await response.text();
  if (!response.ok) {
    const detail = embeddingErrorDetail(text, config.apiKey);
    throw new EmbeddingHttpError(
      response.status,
      embeddingFailureMessage(response.status, detail),
    );
  }

  let raw: { data?: Array<{ index?: number; embedding?: number[] }> };
  try {
    raw = JSON.parse(text) as typeof raw;
  } catch {
    throw new Error("Embedding API \u8fd4\u56de\u7684\u4e0d\u662f\u6709\u6548 JSON");
  }
  const rows = (raw.data ?? [])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((item) => item.embedding ?? []);
  const expected = Array.isArray(input) ? input.length : 1;
  if (
    rows.length !== expected ||
    rows.some((row) => !Array.isArray(row) || !row.length)
  ) {
    throw new Error("Embedding API \u8fd4\u56de\u683c\u5f0f\u4e0d\u6b63\u786e");
  }
  return rows;
}

function assertEmbeddingConfig(config: EmbeddingServiceSettings) {
  if (!config.enabled || !config.apiKey.trim() || !config.model.trim()) {
    throw new Error("Embedding API \u672a\u542f\u7528\u6216\u914d\u7f6e\u4e0d\u5b8c\u6574");
  }
  if (!config.baseUrl.trim()) throw new Error("Embedding API Base URL \u4e0d\u80fd\u4e3a\u7a7a");
}

export async function embedTexts(
  input: string[],
  settings?: EmbeddingServiceSettings,
) {
  const config = settings ?? (await getEmbeddingSettings());
  assertEmbeddingConfig(config);
  return requestEmbeddings(input, config, Boolean(config.dimensions));
}

const toBuffer = (values: number[]) => new Float32Array(values).buffer;
const fromBuffer = (buffer: ArrayBuffer) => new Float32Array(buffer);

export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>) {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export async function ensureMemoryEmbeddings(
  memories: Memory[],
  settings?: EmbeddingServiceSettings,
) {
  const config = settings ?? (await getEmbeddingSettings());
  if (!config.enabled) return 0;
  const pending: Memory[] = [];
  for (const memory of memories) {
    const hash = memory.contentHash ?? memoryContentHash(memory.content);
    const existing = await db.memoryVectors.get(memory.id);
    if (
      !existing ||
      existing.model !== config.model ||
      existing.contentHash !== hash
    )
      pending.push({ ...memory, contentHash: hash });
  }
  let written = 0;
  for (
    let offset = 0;
    offset < pending.length;
    offset += Math.max(1, config.batchSize || 20)
  ) {
    const batch = pending.slice(
      offset,
      offset + Math.max(1, config.batchSize || 20),
    );
    const vectors = await embedTexts(
      batch.map((memory) =>
        [memory.title, memory.content, memory.meaning].filter(Boolean).join("\n"),
      ),
      config,
    );
    const rows: MemoryVector[] = vectors.map((vector, index) => ({
      memoryId: batch[index].id,
      characterId: batch[index].characterId,
      model: config.model,
      dimensions: vector.length,
      contentHash: batch[index].contentHash!,
      vector: toBuffer(vector),
      updatedAt: now(),
    }));
    await db.memoryVectors.bulkPut(rows);
    written += rows.length;
  }
  return written;
}

export async function recallMemoriesWithEmbeddings(
  memories: Memory[],
  characterId: string,
  conversationId: string,
  query: string,
  limit = 10,
) {
  const config = await getEmbeddingSettings();
  const lexical = selectMemories(
    memories,
    characterId,
    conversationId,
    Math.min(300, Math.max(limit * 10, 80)),
    query,
    true,
  );
  if (!config.enabled || !config.apiKey.trim() || !query.trim())
    return lexical.slice(0, limit);
  try {
    const [queryVector] = await embedTexts([query], config);
    const vectors = await db.memoryVectors.bulkGet(
      lexical.map((memory) => memory.id),
    );
    const ranked = lexical
      .map((memory, index) => ({
        memory,
        semantic:
          vectors[index] &&
          vectors[index]!.model === config.model &&
          vectors[index]!.contentHash ===
            (memory.contentHash ?? memoryContentHash(memory.content))
            ? cosineSimilarity(queryVector, fromBuffer(vectors[index]!.vector))
            : 0,
      }))
      .sort(
        (a, b) =>
          b.semantic - a.semantic || b.memory.importance - a.memory.importance,
      );
    return ranked.slice(0, limit).map((row) => row.memory);
  } catch {
    return lexical.slice(0, limit);
  }
}

export async function testEmbeddingConnection(
  value: EmbeddingServiceSettings,
): Promise<EmbeddingConnectionResult> {
  const config = { ...value, enabled: true };
  assertEmbeddingConfig(config);
  const testText = "\u8336\u8336\u673a\u8bb0\u5fc6\u8fde\u63a5\u6d4b\u8bd5";
  try {
    const [vector] = await requestEmbeddings(
      [testText],
      config,
      Boolean(config.dimensions),
    );
    return { dimensions: vector.length, mode: "configured" };
  } catch (error) {
    if (
      !(error instanceof EmbeddingHttpError) ||
      (error.status !== 400 && error.status !== 422)
    ) {
      throw error;
    }
  }

  try {
    const [vector] = await requestEmbeddings([testText], config, false);
    return {
      dimensions: vector.length,
      mode: "without-dimensions",
      warning: config.dimensions
        ? "\u8fde\u63a5\u6210\u529f\uff0c\u5f53\u524d\u670d\u52a1\u4e0d\u652f\u6301\u81ea\u5b9a\u4e49\u7ef4\u5ea6"
        : undefined,
    };
  } catch (error) {
    if (
      !(error instanceof EmbeddingHttpError) ||
      (error.status !== 400 && error.status !== 422)
    ) {
      throw error;
    }
  }

  const [vector] = await requestEmbeddings(testText, config, false);
  return {
    dimensions: vector.length,
    mode: "scalar-input",
    warning: config.dimensions
      ? "\u8fde\u63a5\u6210\u529f\uff0c\u5f53\u524d\u670d\u52a1\u4e0d\u652f\u6301\u81ea\u5b9a\u4e49\u7ef4\u5ea6"
      : "\u8fde\u63a5\u6210\u529f\uff0c\u5f53\u524d\u670d\u52a1\u4ec5\u63a5\u53d7\u5355\u6761\u6587\u672c\u8f93\u5165\u683c\u5f0f",
  };
}
