import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIRenderer } from "../lib/media/openai-renderer";
import { ImageRendererError, type ImageRenderer } from "../lib/media/image-renderer";

test("OpenAIRenderer implements the shared ImageRenderer contract", () => {
  const renderer: ImageRenderer = new OpenAIRenderer("test-key");
  assert.equal(renderer.name, "openai-images-edit");
  assert.equal(typeof renderer.render, "function");
});

test("OpenAIRenderer sends base photo and sponsor logo as two ordered images and surfaces retryable errors", async (t) => {
  const calls: Array<{ url: string; form: FormData }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), form: init.body as FormData });
    return new Response(JSON.stringify({ error: { message: "Rate limited" } }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const renderer = new OpenAIRenderer("test-key", "gpt-image-2");
  await assert.rejects(
    renderer.render({
      baseImage: Buffer.from([1, 2, 3]),
      baseFilename: "base.png",
      baseMimeType: "image/png",
      sponsorLogo: Buffer.from([4, 5, 6]),
      prompt: "test prompt",
      size: "1024x1536",
      quality: "high",
    }),
    (error: unknown) => {
      assert.ok(error instanceof ImageRendererError);
      assert.equal(error.retryable, true);
      return true;
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.openai.com/v1/images/edits");
  const images = calls[0].form.getAll("image[]");
  assert.equal(images.length, 2, "must send exactly Image 1 (base) and Image 2 (sponsor logo)");
  assert.equal(calls[0].form.get("input_fidelity"), "high");
  assert.equal(calls[0].form.get("model"), "gpt-image-2");
  assert.equal(calls[0].form.get("size"), "1024x1536");
  assert.equal(calls[0].form.get("quality"), "high");
});
