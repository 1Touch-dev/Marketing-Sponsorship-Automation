import test from "node:test";
import assert from "node:assert/strict";
import {
  dedupeKey,
  extractReferencedMessageIds,
  isAutomaticReply,
  looksLikeReplySubject,
  sanitizeInboundHtml,
  syncMailboxReplies,
} from "../lib/mail/reply-sync";
import { detectOptOut } from "../lib/contacts/model";
import { INITIAL_DELTA_SINCE, resetGraphTokenCacheForTests } from "../lib/mail/ms-graph";

const T = "00000000-0000-0000-0000-000000000001";
const MAILBOX = "patrocinios@coritiba.com.br";
const BARE = "sesmsgidabc";
const OUTBOUND_ID = "out-1";
const INTERNET_ID = "<reply-1@mail.empresa.com>";

function env(vars: Record<string, string | undefined>) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  return () => {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  };
}

test("extractReferencedMessageIds normalizes SES In-Reply-To to bare local-part", () => {
  const ids = extractReferencedMessageIds([
    { name: "In-Reply-To", value: `<${BARE}@email.amazonses.com>` },
    { name: "References", value: `<other@x.com> <${BARE}@email.amazonses.com>` },
  ]);
  assert.deepEqual(ids, [BARE, "other"]);
});

test("looksLikeReplySubject accepts Re/RE/Res", () => {
  assert.equal(looksLikeReplySubject("Re: Proposta"), true);
  assert.equal(looksLikeReplySubject("RE: hello"), true);
  assert.equal(looksLikeReplySubject("Res: olá"), true);
  assert.equal(looksLikeReplySubject("Proposta comercial"), false);
});

test("isAutomaticReply detects Auto-Submitted and OOO subject", () => {
  assert.equal(
    isAutomaticReply(
      {
        id: "1",
        subject: "Hello",
        internetMessageHeaders: [{ name: "Auto-Submitted", value: "auto-replied" }],
      },
      "body",
    ),
    true,
  );
  assert.equal(
    isAutomaticReply({ id: "2", subject: "Out of Office: away", internetMessageHeaders: [] }, "hi"),
    true,
  );
  assert.equal(
    isAutomaticReply(
      { id: "3", subject: "Re: proposal", internetMessageHeaders: [{ name: "Auto-Submitted", value: "no" }] },
      "Thanks, interested",
    ),
    false,
  );
});

test("sanitizeInboundHtml strips script and handlers", () => {
  const clean = sanitizeInboundHtml(`<p onclick="x()">ok</p><script>alert(1)</script><a href="javascript:void(0)">x</a>`);
  assert.equal(clean.includes("script"), false);
  assert.equal(clean.includes("onclick"), false);
  assert.equal(clean.includes("javascript:"), false);
  assert.equal(clean.includes("ok"), true);
});

test("detectOptOut matches remove me", () => {
  assert.equal(detectOptOut("Please remove me from your list.").optOut, true);
});

test("dedupeKey uses msgraph: + normalized internetMessageId", () => {
  assert.equal(dedupeKey("<abc@mail.com>"), "msgraph:abc@mail.com");
  assert.equal(dedupeKey("abc@mail.com"), "msgraph:abc@mail.com");
});

type Row = Record<string, any>;

/** Minimal in-memory supabase-ish client for reply sync. */
function makeFakeSb(seed: {
  outbound?: Row;
  events?: Row[];
  existingInbound?: Row[];
}) {
  const state = {
    emails: [
      ...(seed.outbound ? [seed.outbound] : []),
      ...(seed.existingInbound ?? []),
    ] as Row[],
    events: (seed.events ?? []) as Row[],
    syncState: null as Row | null,
    suppressions: [] as Row[],
    audits: [] as Row[],
  };

  function chain(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let orderAsc = true;
    let orderKey = "";
    let limitN: number | null = null;
    let op: "select" | "insert" | "update" | "upsert" = "select";
    let payload: any = null;
    let upsertOpts: any = null;
    let patch: any = null;

    const api: any = {
      select(_cols?: string) {
        // Keep write ops so .insert().select().single() works.
        if (op === "insert" || op === "update" || op === "upsert") return api;
        op = "select";
        return api;
      },
      insert(row: any) {
        op = "insert";
        payload = Array.isArray(row) ? row[0] : row;
        return api;
      },
      update(row: any) {
        op = "update";
        patch = row;
        return api;
      },
      upsert(row: any, opts?: any) {
        op = "upsert";
        payload = row;
        upsertOpts = opts;
        return api;
      },
      eq(col: string, val: any) {
        filters.push((r) => r[col] === val);
        return api;
      },
      in(col: string, vals: any[]) {
        filters.push((r) => vals.includes(r[col]));
        return api;
      },
      gte(col: string, val: any) {
        filters.push((r) => String(r[col] ?? "") >= String(val));
        return api;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderKey = col;
        orderAsc = opts?.ascending !== false;
        return api;
      },
      limit(n: number) {
        limitN = n;
        return api;
      },
      maybeSingle: async () => run(true),
      single: async () => run(true),
      then(resolve: any, reject?: any) {
        return Promise.resolve(run(false)).then(resolve, reject);
      },
    };

    async function run(single: boolean) {
      if (table === "mail_sync_state") {
        if (op === "insert") {
          if (state.syncState) return { data: null, error: { message: "duplicate" } };
          state.syncState = { ...payload };
          return { data: state.syncState, error: null };
        }
        if (op === "update") {
          if (!state.syncState) state.syncState = { tenant_id: T, mailbox: MAILBOX };
          Object.assign(state.syncState, patch);
          return { data: state.syncState, error: null };
        }
        return { data: state.syncState, error: null };
      }

      if (table === "message_events") {
        let rows = state.events.filter((r) => filters.every((f) => f(r)));
        if (orderKey) {
          rows = [...rows].sort((a, b) =>
            orderAsc
              ? String(a[orderKey]).localeCompare(String(b[orderKey]))
              : String(b[orderKey]).localeCompare(String(a[orderKey])),
          );
        }
        if (limitN != null) rows = rows.slice(0, limitN);
        if (single) return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      }

      if (table === "contact_suppressions") {
        if (op === "insert") {
          const row = { id: `sup-${state.suppressions.length + 1}`, ...payload };
          state.suppressions.push(row);
          return { data: row, error: null };
        }
        const rows = state.suppressions.filter((r) => filters.every((f) => f(r)));
        if (single) return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      }

      if (table === "audit_logs" || table === "audit_log" || table === "audit_events") {
        if (op === "insert") {
          state.audits.push(payload);
          return { data: payload, error: null };
        }
        return { data: null, error: null };
      }

      if (table === "emails") {
        if (op === "upsert") {
          const key = payload.gmail_message_id;
          const existing = state.emails.find((e) => e.gmail_message_id === key);
          if (existing && upsertOpts?.ignoreDuplicates) {
            return { data: null, error: null };
          }
          if (existing) {
            Object.assign(existing, payload);
            return { data: existing, error: null };
          }
          const row = { id: `in-${state.emails.length + 1}`, ...payload };
          state.emails.push(row);
          return { data: row, error: null };
        }
        if (op === "update") {
          const rows = state.emails.filter((r) => filters.every((f) => f(r)));
          for (const r of rows) Object.assign(r, patch);
          return { data: rows[0] ?? null, error: null };
        }
        if (op === "insert") {
          const row = { id: `e-${state.emails.length + 1}`, ...payload };
          state.emails.push(row);
          return { data: row, error: null };
        }
        let rows = state.emails.filter((r) => filters.every((f) => f(r)));
        // metadata.provider_message_id filter is done in JS by reply-sync after select
        if (orderKey) {
          rows = [...rows].sort((a, b) =>
            orderAsc
              ? String(a[orderKey] ?? "").localeCompare(String(b[orderKey] ?? ""))
              : String(b[orderKey] ?? "").localeCompare(String(a[orderKey] ?? "")),
          );
        }
        if (limitN != null) rows = rows.slice(0, limitN);
        if (single) return { data: rows[0] ?? null, error: null };
        return { data: rows, error: null };
      }

      return { data: single ? null : [], error: null };
    }

    return api;
  }

  return {
    state,
    from: (table: string) => chain(table),
  };
}

function graphFetchFactory(pages: Array<{ value: any[]; next?: string; delta?: string; status?: number; body?: string }>) {
  let tokenDone = false;
  const byUrl = new Map<string, (typeof pages)[0]>();
  pages.forEach((p, i) => {
    const key = i === 0 ? "delta-start" : `next-${i}`;
    byUrl.set(key, p);
  });

  return async (url: string, init?: RequestInit) => {
    if (String(url).includes("oauth2/v2.0/token")) {
      tokenDone = true;
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
    }
    if (!tokenDone) throw new Error("token first");

    if (/\/messages\/[^/?]+(\?|$)/.test(String(url)) && !String(url).includes("/delta")) {
      // fetchMessage enrichment — return headers already on item
      return new Response(JSON.stringify({ id: "m1" }), { status: 200 });
    }

    const isDelta = String(url).includes("/delta") || String(url).includes("deltaLink") || String(url).includes("skiptoken");
    if (isDelta || String(url).startsWith("https://graph")) {
      // Map first call to page 0, subsequent nextLinks by index encoded in URL
      let page = pages[0];
      const nextIdx = String(url).match(/__page=(\d+)/);
      if (nextIdx) page = pages[Number(nextIdx[1])] ?? pages[0];
      if (page.status && page.status >= 400) {
        return new Response(page.body ?? "error", { status: page.status });
      }
      const json: any = { value: page.value };
      if (page.next) json["@odata.nextLink"] = page.next;
      if (page.delta) json["@odata.deltaLink"] = page.delta;
      return new Response(JSON.stringify(json), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };
}

const stubClassify = async () => ({
  classification: "interested",
  confidence: 0.9,
  summary: "stub",
});

function syncOpts(fetchFn: typeof fetch, extra: Record<string, unknown> = {}) {
  return { fetch: fetchFn as any, mailbox: MAILBOX, classifyReply: stubClassify, ...extra };
}

function outboundSeed(overrides: Partial<Row> = {}): Row {
  return {
    id: OUTBOUND_ID,
    tenant_id: T,
    direction: "outbound",
    recipient: "sponsor@empresa.com",
    status: "sent",
    sent_at: new Date().toISOString(),
    proposal_id: "prop-1",
    metadata: { provider_message_id: BARE },
    ...overrides,
  };
}

function hardReplyMsg(overrides: Partial<any> = {}) {
  return {
    id: "graph-1",
    internetMessageId: INTERNET_ID,
    subject: "Re: Proposta",
    from: { emailAddress: { address: "other@empresa.com", name: "Other" } },
    receivedDateTime: new Date().toISOString(),
    body: { contentType: "text", content: "Thanks, interested." },
    internetMessageHeaders: [
      { name: "In-Reply-To", value: `<${BARE}@email.amazonses.com>` },
      { name: "From", value: "Other <other@empresa.com>" },
    ],
    ...overrides,
  };
}

test("hard match via In-Reply-To sets parent replied; idempotent on same internetMessageId", async () => {
  const undo = env({
    MS_GRAPH_TENANT_ID: "t",
    MS_GRAPH_CLIENT_ID: "c",
    MS_GRAPH_CLIENT_SECRET: "s",
    MS_GRAPH_MAILBOX: MAILBOX,
  });
  resetGraphTokenCacheForTests();
  try {
    const sb = makeFakeSb({
      outbound: outboundSeed(),
      events: [
        {
          tenant_id: T,
          event_type: "provider_accepted",
          provider_receipt_id: BARE,
          email_id: OUTBOUND_ID,
          occurred_at: new Date().toISOString(),
        },
      ],
    });

    const fetchFn = graphFetchFactory([
      {
        value: [hardReplyMsg()],
        delta: "https://graph.microsoft.com/v1.0/users/x/mailFolders/inbox/messages/delta?$deltatoken=abc",
      },
    ]);

    const c1 = await syncMailboxReplies(sb, T, syncOpts(fetchFn as any));
    assert.equal(c1.hard_matched, 1);
    assert.equal(c1.inserted, 1);
    assert.equal(sb.state.emails.find((e) => e.id === OUTBOUND_ID)?.status, "replied");
    assert.equal(sb.state.syncState?.delta_link?.includes("deltatoken"), true);

    // Second run: same message id → skip, still idempotent
    resetGraphTokenCacheForTests();
    const fetch2 = graphFetchFactory([
      {
        value: [hardReplyMsg()],
        delta: "https://graph.microsoft.com/v1.0/users/x/mailFolders/inbox/messages/delta?$deltatoken=abc2",
      },
    ]);
    const c2 = await syncMailboxReplies(sb, T, syncOpts(fetch2 as any));
    assert.equal(c2.inserted, 0);
    assert.equal(c2.skipped >= 1, true);
    assert.equal(sb.state.emails.filter((e) => e.direction === "inbound").length, 1);
  } finally {
    undo();
  }
});

test("unrelated inbox mail is not inserted", async () => {
  const undo = env({
    MS_GRAPH_TENANT_ID: "t",
    MS_GRAPH_CLIENT_ID: "c",
    MS_GRAPH_CLIENT_SECRET: "s",
  });
  resetGraphTokenCacheForTests();
  try {
    const sb = makeFakeSb({ outbound: outboundSeed() });
    const fetchFn = graphFetchFactory([
      {
        value: [
          {
            id: "x",
            internetMessageId: "<noise@mail.com>",
            subject: "Newsletter",
            from: { emailAddress: { address: "noise@else.com" } },
            body: { contentType: "text", content: "hi" },
            internetMessageHeaders: [{ name: "From", value: "noise@else.com" }],
          },
        ],
        delta: "https://graph.microsoft.com/delta?$deltatoken=1",
      },
    ]);
    const c = await syncMailboxReplies(sb, T, syncOpts(fetchFn as any));
    assert.equal(c.inserted, 0);
    assert.equal(c.hard_matched, 0);
    assert.equal(c.soft_matched, 0);
  } finally {
    undo();
  }
});

test("reply from a different address still hard-matches via In-Reply-To", async () => {
  const undo = env({
    MS_GRAPH_TENANT_ID: "t",
    MS_GRAPH_CLIENT_ID: "c",
    MS_GRAPH_CLIENT_SECRET: "s",
  });
  resetGraphTokenCacheForTests();
  try {
    const sb = makeFakeSb({
      outbound: outboundSeed({ recipient: "original@empresa.com" }),
      events: [
        {
          tenant_id: T,
          event_type: "provider_accepted",
          provider_receipt_id: BARE,
          email_id: OUTBOUND_ID,
          occurred_at: new Date().toISOString(),
        },
      ],
    });
    const fetchFn = graphFetchFactory([
      {
        value: [hardReplyMsg({ from: { emailAddress: { address: "assistant@empresa.com" } } })],
        delta: "https://graph.microsoft.com/delta?$deltatoken=1",
      },
    ]);
    const c = await syncMailboxReplies(sb, T, syncOpts(fetchFn as any));
    assert.equal(c.hard_matched, 1);
    assert.equal(sb.state.emails.find((e) => e.id === OUTBOUND_ID)?.status, "replied");
  } finally {
    undo();
  }
});

test("soft match alone does not attach without Re: + prior send to same address", async () => {
  const undo = env({
    MS_GRAPH_TENANT_ID: "t",
    MS_GRAPH_CLIENT_ID: "c",
    MS_GRAPH_CLIENT_SECRET: "s",
  });
  resetGraphTokenCacheForTests();
  try {
    const sb = makeFakeSb({ outbound: outboundSeed({ recipient: "sponsor@empresa.com" }) });
    // Same sender address but no Re: subject and no In-Reply-To
    const fetchFn = graphFetchFactory([
      {
        value: [
          {
            id: "s1",
            internetMessageId: "<soft-no@mail.com>",
            subject: "Hello again",
            from: { emailAddress: { address: "sponsor@empresa.com" } },
            body: { contentType: "text", content: "ping" },
            internetMessageHeaders: [],
          },
        ],
        delta: "https://graph.microsoft.com/delta?$deltatoken=1",
      },
    ]);
    const c = await syncMailboxReplies(sb, T, syncOpts(fetchFn as any));
    assert.equal(c.soft_matched, 0);
    assert.equal(c.inserted, 0);
  } finally {
    undo();
  }
});

test("soft match with Re: links parent needs_review and does not set replied", async () => {
  const undo = env({
    MS_GRAPH_TENANT_ID: "t",
    MS_GRAPH_CLIENT_ID: "c",
    MS_GRAPH_CLIENT_SECRET: "s",
  });
  resetGraphTokenCacheForTests();
  try {
    const sb = makeFakeSb({ outbound: outboundSeed({ recipient: "sponsor@empresa.com", status: "sent" }) });
    const fetchFn = graphFetchFactory([
      {
        value: [
          {
            id: "s2",
            internetMessageId: "<soft-yes@mail.com>",
            subject: "Re: Proposta Coxa",
            from: { emailAddress: { address: "sponsor@empresa.com" } },
            body: { contentType: "text", content: "Interesting" },
            internetMessageHeaders: [],
          },
        ],
        delta: "https://graph.microsoft.com/delta?$deltatoken=1",
      },
    ]);
    const c = await syncMailboxReplies(sb, T, syncOpts(fetchFn as any));
    assert.equal(c.soft_matched, 1);
    assert.equal(c.inserted, 1);
    assert.equal(sb.state.emails.find((e) => e.id === OUTBOUND_ID)?.status, "sent");
    const inbound = sb.state.emails.find((e) => e.direction === "inbound");
    assert.equal(inbound?.metadata?.needs_review, true);
    assert.equal(inbound?.metadata?.parent_email_id, OUTBOUND_ID);
    assert.equal(inbound?.status_reason, "Needs review");
  } finally {
    undo();
  }
});

test("out-of-office stores classification and does not set parent replied", async () => {
  const undo = env({
    MS_GRAPH_TENANT_ID: "t",
    MS_GRAPH_CLIENT_ID: "c",
    MS_GRAPH_CLIENT_SECRET: "s",
  });
  resetGraphTokenCacheForTests();
  try {
    const sb = makeFakeSb({
      outbound: outboundSeed({ status: "sent" }),
      events: [
        {
          tenant_id: T,
          event_type: "provider_accepted",
          provider_receipt_id: BARE,
          email_id: OUTBOUND_ID,
          occurred_at: new Date().toISOString(),
        },
      ],
    });
    const fetchFn = graphFetchFactory([
      {
        value: [
          hardReplyMsg({
            subject: "Automatic reply: Out of Office",
            body: { contentType: "text", content: "I am out of office until Monday." },
            internetMessageHeaders: [
              { name: "In-Reply-To", value: `<${BARE}@email.amazonses.com>` },
              { name: "Auto-Submitted", value: "auto-replied" },
            ],
          }),
        ],
        delta: "https://graph.microsoft.com/delta?$deltatoken=1",
      },
    ]);
    const c = await syncMailboxReplies(sb, T, syncOpts(fetchFn as any));
    assert.equal(c.ooo, 1);
    assert.equal(c.inserted, 1);
    assert.equal(sb.state.emails.find((e) => e.id === OUTBOUND_ID)?.status, "sent");
    const inbound = sb.state.emails.find((e) => e.direction === "inbound");
    assert.equal(inbound?.reply_classification, "out_of_office");
    assert.equal(inbound?.metadata?.parent_email_id, OUTBOUND_ID);
  } finally {
    undo();
  }
});

test("unmatched out-of-office is skipped and not inserted", async () => {
  const undo = env({
    MS_GRAPH_TENANT_ID: "t",
    MS_GRAPH_CLIENT_ID: "c",
    MS_GRAPH_CLIENT_SECRET: "s",
  });
  resetGraphTokenCacheForTests();
  try {
    const sb = makeFakeSb({ outbound: outboundSeed({ status: "sent" }) });
    const fetchFn = graphFetchFactory([
      {
        value: [
          {
            id: "ooo-noise",
            internetMessageId: "<ooo-unrelated@mail.com>",
            subject: "Automatic reply: Out of Office",
            from: { emailAddress: { address: "stranger@elsewhere.com" } },
            body: { contentType: "text", content: "I am away." },
            internetMessageHeaders: [{ name: "Auto-Submitted", value: "auto-replied" }],
          },
        ],
        delta: "https://graph.microsoft.com/delta?$deltatoken=1",
      },
    ]);
    const c = await syncMailboxReplies(sb, T, syncOpts(fetchFn as any));
    assert.equal(c.ooo, 0);
    assert.equal(c.inserted, 0);
    assert.equal(c.skipped >= 1, true);
    assert.equal(sb.state.emails.filter((e) => e.direction === "inbound").length, 0);
    assert.equal(sb.state.emails.find((e) => e.id === OUTBOUND_ID)?.status, "sent");
  } finally {
    undo();
  }
});

test("enrichment fetchMessage failure aborts and does not save cursor", async () => {
  const undo = env({
    MS_GRAPH_TENANT_ID: "t",
    MS_GRAPH_CLIENT_ID: "c",
    MS_GRAPH_CLIENT_SECRET: "s",
  });
  resetGraphTokenCacheForTests();
  try {
    const sb = makeFakeSb({ outbound: outboundSeed() });
    const fetchFn = async (url: string) => {
      if (String(url).includes("oauth2")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      }
      if (String(url).includes("/delta")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: "needs-enrich",
                // Missing internetMessageId + headers → triggers fetchMessage
                subject: "Re: x",
                from: { emailAddress: { address: "a@b.com" } },
                body: { contentType: "text", content: "hi" },
              },
            ],
            "@odata.deltaLink": "https://graph.microsoft.com/delta?$deltatoken=should-not-save",
          }),
          { status: 200 },
        );
      }
      // fetchMessage path
      return new Response("boom", { status: 500 });
    };

    const c = await syncMailboxReplies(sb, T, syncOpts(fetchFn as any));
    assert.equal(c.errors.length >= 1, true);
    assert.match(c.errors[0] ?? "", /enrich failed|fetchMessage|500/i);
    assert.equal(sb.state.syncState?.delta_link ?? null, null);
  } finally {
    undo();
  }
});

test("fresh delta URL includes receivedDateTime filter from 2026-11-16", async () => {
  const undo = env({
    MS_GRAPH_TENANT_ID: "t",
    MS_GRAPH_CLIENT_ID: "c",
    MS_GRAPH_CLIENT_SECRET: "s",
  });
  resetGraphTokenCacheForTests();
  try {
    const sb = makeFakeSb({ outbound: outboundSeed() });
    const seen: string[] = [];
    const fetchFn = async (url: string, init?: RequestInit) => {
      if (String(url).includes("oauth2")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      }
      seen.push(String(url));
      const prefer = String((init?.headers as Record<string, string>)?.Prefer ?? "");
      assert.match(prefer, /odata\.maxpagesize=50/);
      assert.match(prefer, /outlook\.body-content-type="text"/);
      return new Response(
        JSON.stringify({
          value: [],
          "@odata.deltaLink": "https://graph.microsoft.com/delta?$deltatoken=fresh",
        }),
        { status: 200 },
      );
    };

    await syncMailboxReplies(sb, T, syncOpts(fetchFn as any));
    const deltaUrl = seen.find((u) => u.includes("/messages/delta"));
    assert.ok(deltaUrl, "expected a fresh delta request");
    assert.ok(
      deltaUrl!.includes(encodeURIComponent(`receivedDateTime ge ${INITIAL_DELTA_SINCE}`)) ||
        deltaUrl!.includes(`receivedDateTime ge ${INITIAL_DELTA_SINCE}`),
      `filter missing in ${deltaUrl}`,
    );
  } finally {
    undo();
  }
});

test("remove me opt-out records suppression on hard match", async () => {
  const undo = env({
    MS_GRAPH_TENANT_ID: "t",
    MS_GRAPH_CLIENT_ID: "c",
    MS_GRAPH_CLIENT_SECRET: "s",
  });
  resetGraphTokenCacheForTests();
  try {
    const sb = makeFakeSb({
      outbound: outboundSeed(),
      events: [
        {
          tenant_id: T,
          event_type: "provider_accepted",
          provider_receipt_id: BARE,
          email_id: OUTBOUND_ID,
          occurred_at: new Date().toISOString(),
        },
      ],
    });

    const body = "Please remove me from your mailing list.";
    assert.equal(detectOptOut(body).optOut, true);

    const fetchFn = graphFetchFactory([
      {
        value: [hardReplyMsg({ body: { contentType: "text", content: body } })],
        delta: "https://graph.microsoft.com/delta?$deltatoken=1",
      },
    ]);

    const c = await syncMailboxReplies(sb, T, syncOpts(fetchFn as any));
    assert.equal(c.hard_matched, 1);
    assert.equal(c.inserted, 1);
    assert.equal(sb.state.suppressions.length, 1);
    assert.equal(sb.state.suppressions[0].email, "other@empresa.com");
    assert.equal(sb.state.suppressions[0].reason_code, "asked_to_stop");
  } finally {
    undo();
  }
});

test("syncStateNotFound clears cursor and retries fresh delta", async () => {
  const undo = env({
    MS_GRAPH_TENANT_ID: "t",
    MS_GRAPH_CLIENT_ID: "c",
    MS_GRAPH_CLIENT_SECRET: "s",
  });
  resetGraphTokenCacheForTests();
  try {
    const bad = "https://graph.microsoft.com/v1.0/users/x/mailFolders/inbox/messages/delta?$deltatoken=bad";
    const sb = makeFakeSb({ outbound: outboundSeed() });
    sb.state.syncState = {
      tenant_id: T,
      mailbox: MAILBOX,
      delta_link: bad,
      lock_until: null,
    };

    const fetchFn = async (url: string) => {
      if (String(url).includes("oauth2")) {
        return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), { status: 200 });
      }
      if (String(url) === bad) {
        return new Response(JSON.stringify({ error: { code: "syncStateNotFound" } }), { status: 400 });
      }
      return new Response(
        JSON.stringify({
          value: [],
          "@odata.deltaLink": "https://graph.microsoft.com/delta?$deltatoken=fresh",
        }),
        { status: 200 },
      );
    };

    const c = await syncMailboxReplies(sb, T, syncOpts(fetchFn as any));
    assert.equal(c.errors.length, 0);
    assert.equal(sb.state.syncState?.delta_link?.includes("fresh"), true);
  } finally {
    undo();
  }
});

test("delta cursor is not saved when ingest errors occur", async () => {
  const undo = env({
    MS_GRAPH_TENANT_ID: "t",
    MS_GRAPH_CLIENT_ID: "c",
    MS_GRAPH_CLIENT_SECRET: "s",
  });
  resetGraphTokenCacheForTests();
  try {
    const sb = makeFakeSb({
      outbound: outboundSeed(),
      events: [
        {
          tenant_id: T,
          event_type: "provider_accepted",
          provider_receipt_id: BARE,
          email_id: OUTBOUND_ID,
          occurred_at: new Date().toISOString(),
        },
      ],
    });
    const origFrom = sb.from.bind(sb);
    sb.from = (table: string) => {
      if (table === "emails") {
        const api = origFrom(table);
        api.upsert = () => {
          throw new Error("db down");
        };
        return api;
      }
      return origFrom(table);
    };

    const fetchFn = graphFetchFactory([
      {
        value: [hardReplyMsg()],
        delta: "https://graph.microsoft.com/delta?$deltatoken=nosave",
      },
    ]);

    const c = await syncMailboxReplies(sb, T, syncOpts(fetchFn as any));
    assert.equal(c.errors.length >= 1, true);
    assert.equal(sb.state.syncState?.delta_link ?? null, null);
  } finally {
    undo();
  }
});
