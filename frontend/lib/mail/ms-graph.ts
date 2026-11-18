/**
 * Microsoft Graph client for reading patrocinios@ (app-only client credentials).
 * Phase B reply sync — secrets from env only; never log the client secret.
 */

export class GraphNotConfiguredError extends Error {
  constructor() {
    super("Microsoft Graph is not configured (MS_GRAPH_TENANT_ID / CLIENT_ID / CLIENT_SECRET).");
    this.name = "GraphNotConfiguredError";
  }
}

export class GraphSyncStateNotFoundError extends Error {
  constructor(message = "Graph delta sync state not found") {
    super(message);
    this.name = "GraphSyncStateNotFoundError";
  }
}

export type GraphInternetHeader = { name?: string; value?: string };

export type GraphMessage = {
  id: string;
  internetMessageId?: string | null;
  subject?: string | null;
  from?: { emailAddress?: { address?: string; name?: string } } | null;
  receivedDateTime?: string | null;
  body?: { contentType?: string; content?: string } | null;
  internetMessageHeaders?: GraphInternetHeader[] | null;
  /** Soft-deleted / removed in delta */
  "@removed"?: { reason?: string };
};

export type InboxDeltaResult = {
  messages: GraphMessage[];
  /** Persist only when runComplete — final deltaLink, or nextLink if truncated mid-run so the next cron continues. */
  cursorToSave: string | null;
  /** True when a final @odata.deltaLink was reached (safe end-of-window). */
  runComplete: boolean;
  pages: number;
  truncated: boolean;
};

const GRAPH = "https://graph.microsoft.com/v1.0";
const DEFAULT_PAGE_CAP = 10;
const SELECT =
  "id,internetMessageId,subject,from,receivedDateTime,body,internetMessageHeaders";

type TokenCache = { accessToken: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export function graphMailbox(): string {
  return (process.env.MS_GRAPH_MAILBOX?.trim() || "patrocinios@coritiba.com.br").toLowerCase();
}

export function graphConfigured(): boolean {
  return !!(
    process.env.MS_GRAPH_TENANT_ID?.trim() &&
    process.env.MS_GRAPH_CLIENT_ID?.trim() &&
    process.env.MS_GRAPH_CLIENT_SECRET?.trim()
  );
}

function requireGraphEnv(): { tenantId: string; clientId: string; clientSecret: string } {
  const tenantId = process.env.MS_GRAPH_TENANT_ID?.trim();
  const clientId = process.env.MS_GRAPH_CLIENT_ID?.trim();
  const clientSecret = process.env.MS_GRAPH_CLIENT_SECRET?.trim();
  if (!tenantId || !clientId || !clientSecret) throw new GraphNotConfiguredError();
  return { tenantId, clientId, clientSecret };
}

export async function getGraphToken(deps: { fetch?: typeof fetch } = {}): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.accessToken;

  const { tenantId, clientId, clientSecret } = requireGraphEnv();
  const fetchFn = deps.fetch ?? fetch;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetchFn(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`Graph token failed: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim());
  }
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: now + Math.max(60, Number(json.expires_in ?? 3600)) * 1000,
  };
  return tokenCache.accessToken;
}

/** Reset cached token (tests). */
export function resetGraphTokenCacheForTests() {
  tokenCache = null;
}

function isSyncStateNotFound(status: number, body: string): boolean {
  if (status !== 400 && status !== 404) return false;
  return /syncStateNotFound|SyncStateNotFound|resyncRequired|ResyncRequired/i.test(body);
}

async function graphGet(
  url: string,
  token: string,
  deps: { fetch?: typeof fetch } = {},
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const fetchFn = deps.fetch ?? fetch;
  const res = await fetchFn(url, {
    headers: {
      authorization: `Bearer ${token}`,
      Prefer: 'outlook.body-content-type="text"',
      accept: "application/json",
    },
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = {};
  }
  return { status: res.status, json, text };
}

export function headerValue(headers: GraphInternetHeader[] | null | undefined, name: string): string | null {
  if (!headers?.length) return null;
  const want = name.toLowerCase();
  const h = headers.find((x) => (x.name ?? "").toLowerCase() === want);
  return h?.value?.trim() || null;
}

export async function fetchMessage(
  mailbox: string,
  messageId: string,
  deps: { fetch?: typeof fetch; token?: string } = {},
): Promise<GraphMessage> {
  const token = deps.token ?? (await getGraphToken(deps));
  const url =
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/messages/${encodeURIComponent(messageId)}` +
    `?$select=${SELECT}`;
  const { status, json, text } = await graphGet(url, token, deps);
  if (status === 404) throw new Error(`Graph message not found: ${messageId}`);
  if (status >= 400) throw new Error(`Graph fetchMessage ${status}: ${text.slice(0, 300)}`);
  return json as unknown as GraphMessage;
}

/**
 * Inbox folder delta. Pass null deltaLink for a fresh sync.
 * Caps pages per run; truncated=true means more remains for the next cron.
 */
export async function fetchInboxDelta(
  mailbox: string,
  deltaLink: string | null,
  opts: { pageCap?: number; fetch?: typeof fetch; token?: string } = {},
): Promise<InboxDeltaResult> {
  const pageCap = opts.pageCap ?? DEFAULT_PAGE_CAP;
  const token = opts.token ?? (await getGraphToken(opts));
  const initial =
    deltaLink ||
    `${GRAPH}/users/${encodeURIComponent(mailbox)}/mailFolders/inbox/messages/delta?$select=${SELECT}`;

  let url: string | null = initial;
  const messages: GraphMessage[] = [];
  let pages = 0;
  let finalDelta: string | null = null;
  let truncated = false;
  let pendingNext: string | null = null;

  while (url) {
    if (pages >= pageCap) {
      truncated = true;
      pendingNext = url;
      break;
    }
    const { status, json, text } = await graphGet(url, token, opts);
    if (isSyncStateNotFound(status, text)) {
      throw new GraphSyncStateNotFoundError(text.slice(0, 200));
    }
    if (status >= 400) {
      throw new Error(`Graph inbox delta ${status}: ${text.slice(0, 300)}`);
    }
    pages += 1;
    const value = Array.isArray(json.value) ? (json.value as GraphMessage[]) : [];
    for (const m of value) {
      if (m["@removed"]) continue;
      messages.push(m);
    }
    const nl = typeof json["@odata.nextLink"] === "string" ? json["@odata.nextLink"] : null;
    const dl = typeof json["@odata.deltaLink"] === "string" ? json["@odata.deltaLink"] : null;
    if (nl) {
      url = nl;
      finalDelta = null;
    } else {
      url = null;
      finalDelta = dl;
    }
  }

  // Enrich messages missing headers (delta sometimes omits them).
  const enriched: GraphMessage[] = [];
  for (const m of messages) {
    if (!m.id) continue;
    if (m.internetMessageHeaders && m.internetMessageHeaders.length > 0 && m.internetMessageId) {
      enriched.push(m);
      continue;
    }
    try {
      const full = await fetchMessage(mailbox, m.id, { ...opts, token });
      enriched.push({ ...m, ...full });
    } catch {
      enriched.push(m);
    }
  }

  const runComplete = !truncated && !!finalDelta;
  // On truncate, save nextLink so the next cron continues; on clean end, save deltaLink.
  // On failure mid-run the caller must not persist — only persist cursorToSave after ingest succeeds.
  return {
    messages: enriched,
    cursorToSave: truncated ? pendingNext : finalDelta,
    runComplete,
    pages,
    truncated,
  };
}
