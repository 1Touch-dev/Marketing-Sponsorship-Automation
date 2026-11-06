# AI video intro

"Generate with AI" next to **Personalized Video Intro** in the proposal editor turns one of the proposal's generated
images (jersey, stadium or campaign creative, with the sponsor's logo) into a short video.

## How it works
1. `GET /api/media/video?proposal_id=…` lists the proposal's usable images and its past videos.
2. `POST /api/media/video` starts a render at Replicate (image to video) and stores a row in `video_jobs`. It returns at once.
3. The panel checks `GET /api/media/video/:id` every 6 s. That call asks Replicate, and when the render is done it copies the
   mp4 into our storage (`campaign-assets/videos/<tenant>/<job>.mp4`), because Replicate's links expire.
4. **Use as intro** puts that address in `content.video_intro_url`. The public page already plays direct `.mp4` links.

Code: `lib/video/replicate-video.ts` (Replicate calls, model table, cost), `lib/video/motion-prompts.ts`,
`lib/video/jobs.ts` (job life cycle), routes in `app/api/media/video/`, UI in `components/proposals/ai-video-intro-panel.tsx`.
Ported from the 1Touch AI Studio (`lib/video/*`, `lib/jobs/process-video-job.ts`).

## Settings
- `REPLICATE_API_TOKEN` (already used for the jersey LoRA).
- `VIDEO_MODEL` (optional). Default `kwaivgi/kling-v2.5-turbo-pro`. Other entry in `VIDEO_MODELS`:
  `bytedance/seedance-2.0-fast` (adds sound, but it refuses photos of real people, so jersey and campaign images fail).
  A new model is one entry in that table. `kwaivgi/kling-v2.1` (the Studio's model) was discontinued by Replicate.

## Motion prompts
Presets per image type live in `lib/video/motion-prompts.ts` (jersey, stadium/LED, everything else). The first version
asked for "subtle" motion and "only the camera moves", which gave a plain zoom. They now name what moves (player,
crowd, cloth, smoke, light) and how the camera travels, and the negative prompt includes "static image, frozen frame".
Tested on real proposal images (6 Nov 2026), 5 s clips, average frame-to-frame change (higher is livelier):
jersey 16 -> 53, stadium 1.8 -> 20, campaign 25 -> 51, social post -> 49.

Stadium images are different: the sponsor board is often at the bottom edge, and a forward or upward camera move pushed it
out of the shot (and "LED boards glow" smeared its logo). So the stadium preset uses a sideways tracking shot, with
"no push-in, no zoom, no tilt" and a matching negative prompt. That keeps the board in view but is the gentlest of the
presets. Known limits: the model sometimes invents gibberish text on an empty stretch of a board, and a social-post
poster may cut to a wider scene so its logo is not in every frame. A person's own text in the panel replaces the preset (the logo sentence is always added).

## Safeguards
- Needs the `generate_images` permission; every query is filtered by tenant.
- Daily AI spend cap is checked before each start; at most 4 videos render at once per tenant; 6 starts per minute.
- Cost is an ESTIMATE (`costPerSecondUsd`, about $0.07/s for Kling 2.5 Turbo Pro, so $0.35 per 5 s clip) written to
  `spend_ledger` as `video_generation` when the video completes. Check it against the Replicate bill.
- A render still running after 20 minutes is marked failed, so the screen never spins forever.
- The sponsor-logo sentence is added to every prompt, and a negative prompt blocks overlays and distorted logos.

## Known limits (next steps)
- One image becomes one 5 or 10 second clip, in the image's own shape. No text-to-video, script writer, format or
  aspect-ratio choice, reference upload, or narration yet.
- Joining several clips needs ffmpeg, which is not installed on the live server.
- Progress is only checked while the editor panel is open (or when it is opened again). A scheduler sweep could do it in the background.
