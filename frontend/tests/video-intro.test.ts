import test from "node:test";
import assert from "node:assert/strict";
import {
  createVideoPrediction,
  estimateVideoCostUsd,
  normalizeDuration,
  toVideoPrediction,
  videoModelId,
  VIDEO_MODELS,
  DEFAULT_VIDEO_MODEL,
  VideoRendererError,
  NEGATIVE_PROMPT,
} from "../lib/video/replicate-video";
import { buildMotionPrompt, motionStyleFor, negativePromptFor, MAX_CUSTOM_PROMPT_CHARS } from "../lib/video/motion-prompts";
import { isStale, STALE_AFTER_MS } from "../lib/video/jobs";

process.env.REPLICATE_API_TOKEN = "r8_test_token";

const REQ = { imageUrl: "https://x.test/a.png", prompt: "move", durationS: 5 };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 201 });

test("every model builds an input with the image and the prompt", () => {
  for (const spec of Object.values(VIDEO_MODELS)) {
    const input = spec.buildInput(REQ);
    assert.ok(Object.values(input).includes(REQ.imageUrl), `${spec.id} passes the image`);
    assert.ok(Object.values(input).includes(REQ.prompt), `${spec.id} passes the prompt`);
  }
});

test("kling uses start_image and a negative prompt; seedance asks for sound", () => {
  const kling = VIDEO_MODELS[DEFAULT_VIDEO_MODEL].buildInput(REQ);
  assert.equal(kling.start_image, REQ.imageUrl);
  assert.equal(kling.duration, 5);
  assert.ok(String(kling.negative_prompt).includes("watermark"));
  assert.equal(VIDEO_MODELS["bytedance/seedance-2.0-fast"].buildInput(REQ).generate_audio, true);
});

test("duration only allows 5 or 10", () => {
  assert.equal(normalizeDuration(10), 10);
  assert.equal(normalizeDuration("10"), 10);
  assert.equal(normalizeDuration(7), 5);
  assert.equal(normalizeDuration(undefined), 5);
  assert.equal(normalizeDuration(9999), 5);
});

test("cost estimate scales with length and falls back to the default model", () => {
  assert.equal(estimateVideoCostUsd(DEFAULT_VIDEO_MODEL, 10), 0.7);
  assert.equal(estimateVideoCostUsd(DEFAULT_VIDEO_MODEL, 5), 0.35);
  assert.equal(estimateVideoCostUsd("unknown/model", 5), 0.35);
});

test("an unknown VIDEO_MODEL setting falls back to the default", () => {
  process.env.VIDEO_MODEL = "not/a-model";
  assert.equal(videoModelId(), DEFAULT_VIDEO_MODEL);
  process.env.VIDEO_MODEL = "bytedance/seedance-2.0-fast";
  assert.equal(videoModelId(), "bytedance/seedance-2.0-fast");
  process.env.VIDEO_MODEL = "kwaivgi/kling-v2.1"; // discontinued, so it must fall back
  assert.equal(videoModelId(), DEFAULT_VIDEO_MODEL);
  delete process.env.VIDEO_MODEL;
});

test("replicate output (string or list) becomes one output url", () => {
  assert.equal(toVideoPrediction({ id: "p", status: "succeeded", output: "https://o/v.mp4", error: null }).outputUrl, "https://o/v.mp4");
  assert.equal(toVideoPrediction({ id: "p", status: "succeeded", output: ["https://o/a.mp4"], error: null }).outputUrl, "https://o/a.mp4");
  assert.equal(toVideoPrediction({ id: "p", status: "processing", output: null, error: null }).outputUrl, undefined);
});

test("create retries a busy replicate (429) and then succeeds", async () => {
  let calls = 0;
  const fake = (async () => {
    calls++;
    return calls < 3 ? new Response(JSON.stringify({ detail: "busy" }), { status: 429 }) : ok({ id: "pred1", status: "starting", output: null, error: null });
  }) as unknown as typeof fetch;
  const p = await createVideoPrediction(DEFAULT_VIDEO_MODEL, REQ, fake, 1);
  assert.equal(p.id, "pred1");
  assert.equal(calls, 3);
});

test("create does not retry a rejected request (422) and sends the token", async () => {
  let calls = 0;
  let auth = "";
  const fake = (async (_u: unknown, init: RequestInit) => {
    calls++;
    auth = String((init.headers as Record<string, string>).Authorization);
    return new Response(JSON.stringify({ detail: "bad input" }), { status: 422 });
  }) as unknown as typeof fetch;
  await assert.rejects(createVideoPrediction(DEFAULT_VIDEO_MODEL, REQ, fake, 1), (e: unknown) => e instanceof VideoRendererError && !e.retryable);
  assert.equal(calls, 1);
  assert.equal(auth, "Bearer r8_test_token");
});

test("create gives up after three busy answers", async () => {
  let calls = 0;
  const fake = (async () => {
    calls++;
    return new Response("{}", { status: 503 });
  }) as unknown as typeof fetch;
  await assert.rejects(createVideoPrediction(DEFAULT_VIDEO_MODEL, REQ, fake, 1), VideoRendererError);
  assert.equal(calls, 3);
});

test("motion style follows the image type", () => {
  assert.equal(motionStyleFor("jersey_mockup_official"), "jersey");
  assert.equal(motionStyleFor("stadium_mockup_official"), "stadium");
  assert.equal(motionStyleFor("campaign_creative"), "generic");
  assert.equal(motionStyleFor(null), "generic");
});

test("every motion prompt protects the sponsor logo, including a custom one", () => {
  for (const t of ["jersey_mockup_official", "stadium_mockup_official", "campaign_creative"]) {
    assert.match(buildMotionPrompt(t), /sponsor logo and the club crest keep/);
  }
  const custom = buildMotionPrompt("campaign_creative", "  slow   pan  across the pitch ");
  assert.ok(custom.startsWith("slow pan across the pitch"));
  assert.match(custom, /sponsor logo and the club crest keep/);
});

test("every preset asks for real movement and none says the camera is the only thing that moves", () => {
  for (const t of ["jersey_mockup_official", "stadium_mockup_official", "campaign_creative", "social_post", "custom"]) {
    const p = buildMotionPrompt(t);
    assert.doesNotMatch(p, /only the camera moves|mostly steady|subtle/i, t);
    assert.match(p, /camera (glides|performs)/i, t);
  }
});

test("the negative prompt pushes against a still image", () => {
  assert.match(NEGATIVE_PROMPT, /static image/);
  assert.match(NEGATIVE_PROMPT, /distorted logo/);
});

test("stadium shots keep the sponsor board in frame: sideways camera, no push-in", () => {
  const p = buildMotionPrompt("stadium_mockup_official");
  assert.match(p, /lateral tracking/);
  assert.match(p, /No push-in, no zoom, no tilt/);
  assert.doesNotMatch(p, /animate and glow/);
  assert.match(negativePromptFor("stadium_mockup_official"), /sponsor board leaving the frame/);
  assert.doesNotMatch(negativePromptFor("jersey_mockup_official"), /camera tilting up/);
  assert.equal(negativePromptFor("stadium_mockup_official", "my own text"), NEGATIVE_PROMPT);
});

test("a very long custom prompt is cut to the limit", () => {
  const p = buildMotionPrompt("campaign_creative", "x".repeat(5000));
  assert.ok(p.length < MAX_CUSTOM_PROMPT_CHARS + 200);
});

test("a job still rendering after the time limit counts as stale", () => {
  const now = Date.now();
  const old = new Date(now - STALE_AFTER_MS - 1000).toISOString();
  const fresh = new Date(now - 60_000).toISOString();
  assert.equal(isStale({ status: "processing", created_at: old }, now), true);
  assert.equal(isStale({ status: "processing", created_at: fresh }, now), false);
  assert.equal(isStale({ status: "completed", created_at: old }, now), false);
});
