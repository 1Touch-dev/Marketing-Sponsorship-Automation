import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import os from "os";
import crypto from "crypto";

const execFileAsync = promisify(execFile);

/**
 * Branded PDF export via headless Chromium (Task 7 — reuses the same
 * `--headless --print-to-pdf` invocation proven in an earlier session for
 * the James status-update PDF). Renders whatever URL is passed — the
 * public proposal share page is the intended target, since it's already
 * unauthenticated, fully styled for print (print:hidden classes throughout
 * proposal-landing-page.tsx), and gets the same benefit-first/polish work
 * as Task 4.
 */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
].filter(Boolean) as string[];

function resolveChromePath(): string {
  for (const candidate of CHROME_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("Headless Chromium binary not found — checked: " + CHROME_CANDIDATES.join(", "));
}

export async function renderUrlToPdf(url: string): Promise<Buffer> {
  const chrome = resolveChromePath();
  const outPath = join(os.tmpdir(), `proposal-pdf-${crypto.randomUUID()}.pdf`);
  try {
    await execFileAsync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=10000",
        `--print-to-pdf=${outPath}`,
        url,
      ],
      { timeout: 30_000 },
    );
    return await readFile(outPath);
  } finally {
    if (existsSync(outPath)) await unlink(outPath).catch(() => {});
  }
}
