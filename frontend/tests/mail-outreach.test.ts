import test from "node:test";
import assert from "node:assert/strict";
import {
  injectOutreachUnsubscribeFooter,
  isUncertainSesFailure,
  normalizeSesMessageId,
  OutreachMailNotConfiguredError,
  sendOutreachEmail,
} from "../lib/mail/outreach";
import { MailError, resetSesClientForTests, sendViaSes } from "../lib/mail/ses";
import { isReservedRecipientDomain } from "../lib/email/reserved-recipient";
import { fakeSes } from "./helpers/fake-ses";
import { toolSendEmail } from "../lib/agents/tools";

const T = "00000000-0000-0000-0000-000000000001";

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

const baseMail = {
  to: "sponsor@empresa.com",
  subject: "Proposta Coxa",
  bodyText: "texto",
  bodyHtml: "<p>html</p>",
  tenantId: T,
  appUrl: "https://app.test",
};

test("normalizeSesMessageId strips brackets and keeps the bare local-part", () => {
  assert.deepEqual(normalizeSesMessageId("abc@email.amazonses.com"), {
    bare: "abc",
    raw: "abc@email.amazonses.com",
  });
  assert.deepEqual(normalizeSesMessageId("<abc@region.amazonses.com>"), {
    bare: "abc",
    raw: "abc@region.amazonses.com",
  });
  assert.equal(normalizeSesMessageId("no-at-sign").bare, "no-at-sign");
});

test("isUncertainSesFailure: transient and timeouts are unclear; hard rejects are not", () => {
  assert.equal(isUncertainSesFailure(new MailError("throttle", "ThrottlingException", true)), true);
  assert.equal(isUncertainSesFailure(new MailError("bad", "MessageRejected", false)), false);
  assert.equal(isUncertainSesFailure(new OutreachMailNotConfiguredError()), false);
  assert.equal(isUncertainSesFailure(new Error("fetch failed")), true);
  assert.equal(isUncertainSesFailure(new Error("Request timed out")), true);
});

test("SES mailbox simulator addresses are not blocked by reserved-domain guard", () => {
  for (const a of [
    "success@simulator.amazonses.com",
    "bounce@simulator.amazonses.com",
    "complaint@simulator.amazonses.com",
  ]) {
    assert.equal(isReservedRecipientDomain(a), false, a);
  }
  assert.equal(isReservedRecipientDomain("x@example.com"), true);
});

test("sendOutreachEmail refuses when MAIL_PROVIDER is not ses", async () => {
  const undo = env({ MAIL_PROVIDER: "gmail", UNSUBSCRIBE_SECRET: "test-unsubscribe-secret!!" });
  try {
    await assert.rejects(
      () => sendOutreachEmail(baseMail),
      (e: unknown) => e instanceof OutreachMailNotConfiguredError,
    );
  } finally {
    undo();
  }
});

test("sendOutreachEmail succeeds via SES with unsubscribe headers and bare message id", async () => {
  const ses = await fakeSes();
  const undo = env({
    MAIL_PROVIDER: "ses",
    SES_ENDPOINT: ses.url,
    MAIL_FROM_DOMAIN: undefined,
    MAIL_FROM_ADDRESS: undefined,
    MAIL_FROM_NAME: undefined,
    MAIL_REPLY_TO: "patrocinios@coritiba.com.br",
    UNSUBSCRIBE_SECRET: "test-unsubscribe-secret!!",
  });
  resetSesClientForTests();
  try {
    const r = await sendOutreachEmail(baseMail);
    assert.equal(r.bareMessageId, "fake-msg-1");
    assert.equal(r.messageId, "fake-msg-1");
    assert.equal(ses.seen.length, 1);
    const b = ses.seen[0].body;
    assert.deepEqual(b.Destination.ToAddresses, ["sponsor@empresa.com"]);
    assert.deepEqual(b.ReplyToAddresses, ["patrocinios@coritiba.com.br"]);
    assert.deepEqual(b.EmailTags, [{ Name: "kind", Value: "outreach" }]);
    const headers = b.Content.Simple.Headers as Array<{ Name: string; Value: string }>;
    assert.ok(headers.some((h) => h.Name === "List-Unsubscribe"));
    assert.match(b.Content.Simple.Body.Text.Data, /não receber mais/i);
    assert.match(b.Content.Simple.Body.Html.Data, /Não quero mais receber/);
  } finally {
    undo();
    resetSesClientForTests();
    await ses.close();
  }
});

test("sendOutreachEmail with injected sender: success returns ids; hard failure surfaces MailError", async () => {
  const undo = env({ MAIL_PROVIDER: "ses", MAIL_REPLY_TO: "patrocinios@coritiba.com.br", UNSUBSCRIBE_SECRET: "test-unsubscribe-secret!!" });
  try {
    const ok = await sendOutreachEmail(baseMail, {
      send: async () => ({ messageId: "mid-ok@email.amazonses.com" }),
    });
    assert.equal(ok.bareMessageId, "mid-ok");
    assert.equal(ok.rawMessageId, "mid-ok@email.amazonses.com");

    await assert.rejects(
      () =>
        sendOutreachEmail(baseMail, {
          send: async () => {
            throw new MailError("boom", "SesError", false);
          },
        }),
      (e: unknown) => e instanceof MailError && e.message === "boom" && e.transient === false,
    );
  } finally {
    undo();
  }
});

test("injectOutreachUnsubscribeFooter places the link before </body>", () => {
  const out = injectOutreachUnsubscribeFooter("<html><body><p>Oi</p></body></html>", "https://app.test/u");
  assert.match(out, /Não quero mais receber/);
  assert.ok(out.indexOf("https://app.test/u") < out.indexOf("</body>"));
});

test("agent toolSendEmail refuses non-approved mail and never calls SES", async () => {
  let sesCalled = false;
  const row = {
    id: "e1",
    status: "pending_approval",
    recipient: "a@empresa.com",
    company_id: null,
    proposal_id: null,
    sender_member_id: null,
    tenant_id: T,
    subject: "Hi",
    body_text: "x",
    body_html: null,
    approved_at: null,
    metadata: {},
  };

  const sb = {
    from(table: string) {
      assert.equal(table, "emails");
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: row, error: null }),
              };
            },
          };
        },
        update() {
          throw new Error("should not claim/send when not approved");
        },
      };
    },
  };

  const r = await toolSendEmail(
    { email_id: "e1" },
    {
      sb: sb as never,
      appUrl: "https://app.test",
      send: async () => {
        sesCalled = true;
        return { messageId: "should-not-send" };
      },
    },
  );
  assert.equal(r.success, false);
  assert.match(r.summary, /must be approved/i);
  assert.equal(sesCalled, false);
});

test("sendViaSes still works for newsletter after outreach helper (regression)", async () => {
  const ses = await fakeSes();
  const undo = env({
    MAIL_PROVIDER: "ses",
    SES_ENDPOINT: ses.url,
    MAIL_FROM_DOMAIN: undefined,
    MAIL_FROM_ADDRESS: undefined,
    MAIL_REPLY_TO: "patrocinios@coritiba.com.br",
  });
  resetSesClientForTests();
  try {
    await sendViaSes({ to: "n@x.com", subject: "N", text: "t", kind: "newsletter", tag: "newsletter" });
    assert.equal(ses.seen[0].body.EmailTags[0].Value, "newsletter");
  } finally {
    undo();
    resetSesClientForTests();
    await ses.close();
  }
});
