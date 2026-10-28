import assert from "node:assert/strict";
import test from "node:test";
import {
  isSecureRequest,
  sessionCookieOptions,
  withSessionCookieOptions,
} from "../lib/auth/session-cookie";

function withEnv(vars: { APP_URL?: string | null; NEXT_PUBLIC_APP_URL?: string | null }, fn: () => void) {
  const prevApp = process.env.APP_URL;
  const prevPublic = process.env.NEXT_PUBLIC_APP_URL;
  if (vars.APP_URL === null) delete process.env.APP_URL;
  else if (vars.APP_URL !== undefined) process.env.APP_URL = vars.APP_URL;
  if (vars.NEXT_PUBLIC_APP_URL === null) delete process.env.NEXT_PUBLIC_APP_URL;
  else if (vars.NEXT_PUBLIC_APP_URL !== undefined) process.env.NEXT_PUBLIC_APP_URL = vars.NEXT_PUBLIC_APP_URL;
  try {
    fn();
  } finally {
    if (prevApp === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = prevApp;
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prevPublic;
  }
}

test("https APP_URL → HttpOnly + Secure", () => {
  withEnv({ APP_URL: "https://example.ngrok-free.dev", NEXT_PUBLIC_APP_URL: null }, () => {
    const o = sessionCookieOptions();
    assert.equal(o.httpOnly, true);
    assert.equal(o.secure, true);
    assert.equal(o.sameSite, "lax");
    assert.equal(o.path, "/");
  });
});

test("localhost http APP_URL → Secure false so cookies still stick in dev", () => {
  withEnv({ APP_URL: "http://localhost:3000", NEXT_PUBLIC_APP_URL: null }, () => {
    assert.equal(isSecureRequest(), false);
    assert.equal(sessionCookieOptions().secure, false);
    assert.equal(sessionCookieOptions().httpOnly, true);
  });
});

test("x-forwarded-proto https wins even when APP_URL is http (ngrok)", () => {
  withEnv({ APP_URL: "http://localhost:3000", NEXT_PUBLIC_APP_URL: null }, () => {
    const req = { headers: { get: (n: string) => (n === "x-forwarded-proto" ? "https" : null) } };
    assert.equal(isSecureRequest(req), true);
    assert.equal(sessionCookieOptions(req).secure, true);
  });
});

test("withSessionCookieOptions always overlays HttpOnly / SameSite / path", () => {
  withEnv({ APP_URL: "http://localhost:3000", NEXT_PUBLIC_APP_URL: null }, () => {
    const merged = withSessionCookieOptions({
      httpOnly: false,
      secure: true,
      path: "/auth",
      sameSite: "none",
      maxAge: 99,
    });
    assert.equal(merged.httpOnly, true);
    assert.equal(merged.secure, false);
    assert.equal(merged.sameSite, "lax");
    assert.equal(merged.path, "/");
    assert.equal(merged.maxAge, 99);
  });
});
