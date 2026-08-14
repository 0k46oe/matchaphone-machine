import { afterEach, describe, expect, it, vi } from "vitest";
import {
  embeddingEndpoint,
  testEmbeddingConnection,
} from "./embedding";
import { defaultEmbeddingServiceSettings } from "./types";

const settings = {
  ...defaultEmbeddingServiceSettings,
  enabled: true,
  baseUrl: "https://example.test/v1",
  apiKey: "sk-test-secret-value",
  model: "text-embedding-test",
  dimensions: 256,
};

function success(vector = [0.1, 0.2, 0.3]) {
  return new Response(
    JSON.stringify({ data: [{ index: 0, embedding: vector }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("embedding compatibility", () => {
  it("does not append embeddings twice", () => {
    expect(embeddingEndpoint("https://api.test/v1/embeddings/")).toBe(
      "https://api.test/v1/embeddings",
    );
    expect(embeddingEndpoint("https://api.test/v1/")).toBe(
      "https://api.test/v1/embeddings",
    );
  });

  it("retries without dimensions after a 400", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)));
        return bodies.length === 1
          ? new Response(
              JSON.stringify({ error: { message: "dimensions unsupported" } }),
              { status: 400 },
            )
          : success();
      }),
    );
    const result = await testEmbeddingConnection(settings);
    expect(result).toMatchObject({
      dimensions: 3,
      mode: "without-dimensions",
      warning: "\u8fde\u63a5\u6210\u529f\uff0c\u5f53\u524d\u670d\u52a1\u4e0d\u652f\u6301\u81ea\u5b9a\u4e49\u7ef4\u5ea6",
    });
    expect(bodies[0]).toHaveProperty("dimensions", 256);
    expect(bodies[1]).not.toHaveProperty("dimensions");
  });

  it("falls back to scalar input when array input is rejected", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        bodies.push(body);
        return bodies.length < 3
          ? new Response(JSON.stringify({ error: { message: "use string input" } }), {
              status: 422,
            })
          : success([1, 2]);
      }),
    );
    const result = await testEmbeddingConnection(settings);
    expect(result.mode).toBe("scalar-input");
    expect(typeof bodies[2].input).toBe("string");
  });

  it("shows sanitized server detail without exposing the API key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: { message: `bad model for Bearer ${settings.apiKey}` },
          }),
          { status: 401 },
        ),
      ),
    );
    await expect(testEmbeddingConnection(settings)).rejects.toThrow(
      /bad model/,
    );
    try {
      await testEmbeddingConnection(settings);
    } catch (error) {
      expect(String(error)).not.toContain(settings.apiKey);
    }
  });
});
