/**
 * Resolves a pasted video URL (YouTube, Vimeo, Loom, or a direct file link)
 * into either an iframe embed URL or a flag that it's a direct <video> src.
 * Used for the personalized video intro block (Task 8) and reusable for
 * the existing campaign_video_url field too.
 */
export type VideoEmbed =
  | { kind: "iframe"; embedUrl: string }
  | { kind: "file"; url: string };

export function resolveVideoEmbed(rawUrl: string): VideoEmbed | null {
  const url = rawUrl.trim();
  if (!url) return null;

  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "m.youtube.com") {
      const id = u.searchParams.get("v");
      if (id) return { kind: "iframe", embedUrl: `https://www.youtube.com/embed/${id}` };
      const shortsMatch = u.pathname.match(/\/shorts\/([\w-]+)/);
      if (shortsMatch) return { kind: "iframe", embedUrl: `https://www.youtube.com/embed/${shortsMatch[1]}` };
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      if (id) return { kind: "iframe", embedUrl: `https://www.youtube.com/embed/${id}` };
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      if (id) return { kind: "iframe", embedUrl: `https://player.vimeo.com/video/${id}` };
    }
    if (host === "loom.com") {
      const id = u.pathname.split("/share/")[1] || u.pathname.split("/").pop();
      if (id) return { kind: "iframe", embedUrl: `https://www.loom.com/embed/${id}` };
    }
  } catch {
    return null;
  }

  // Anything else (a direct .mp4/.webm link, or an unrecognized host) is
  // treated as a direct file — the <video> tag degrades gracefully if it
  // isn't actually playable.
  return { kind: "file", url };
}
