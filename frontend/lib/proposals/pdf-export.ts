import { chromium } from "playwright";
import { existsSync } from "fs";

// The installed `playwright` npm package (1.61.0-alpha) expects a browser
// revision that isn't the one actually present on disk (found live-testing
// 2026-09-17: "Executable doesn't exist at .../chromium_headless_shell-1224").
// Pointing directly at the confirmed-working binary already used elsewhere
// on this box sidesteps that mismatch without re-downloading a browser.
const KNOWN_CHROME_PATH = "/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";

/**
 * Branded PDF export via headless Chromium (Task 7).
 *
 * Originally shelled out to the `chrome --headless --print-to-pdf` CLI
 * (the pattern proven in an earlier session for the James status-update
 * PDF). Switched to Playwright's own `page.pdf()` API (2026-09-17, found
 * live-testing) because the CLI path has no real control over Chrome's
 * default print header/footer — it silently baked the rendering
 * machine's own `localhost:3000` URL and a timestamp into every exported
 * PDF, which is wrong for a document meant to go to an external sponsor.
 * `page.pdf()` omits the header/footer entirely unless explicitly asked
 * for (`displayHeaderFooter` defaults to false).
 */
export async function renderUrlToPdf(
  url: string,
  opts?: { cookies?: Array<{ name: string; value: string; url: string }> },
): Promise<Buffer> {
  const browser = await chromium.launch({
    args: ["--no-sandbox"],
    executablePath: existsSync(KNOWN_CHROME_PATH) ? KNOWN_CHROME_PATH : undefined,
  });
  try {
    const context = await browser.newContext();
    if (opts?.cookies?.length) {
      await context.addCookies(opts.cookies);
    }
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    return pdf;
  } finally {
    await browser.close();
  }
}
