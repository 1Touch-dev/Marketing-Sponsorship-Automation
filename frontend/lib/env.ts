import { z } from "zod";

/**
 * Server-side env (never sent to the browser).
 * Validated lazily on first import so that the Next.js build itself doesn't
 * fail when env is partially set (e.g. for static analysis).
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_REGION: z.string().min(1).default("us-east-1"),
  BEDROCK_MODEL_ID: z.string().min(1),

  /** Direct Anthropic API — fallback when Bedrock is unreachable/misconfigured. Optional. */
  ANTHROPIC_API_KEY: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().min(10).optional()
  ),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Google OAuth — kept for threads/Gmail viewing; optional
  GOOGLE_CLIENT_ID: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().optional()),
  GOOGLE_REDIRECT_URI: z.preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().url().optional()),
  DEFAULT_FROM_EMAIL: z.string().email().optional(),

  FOLLOWUP_DELAY_DAYS: z.coerce.number().int().positive().default(3),
  MAX_CAMPAIGN_IDEAS: z.coerce.number().int().positive().default(3),

  /** Internal API secret — required in production, optional in dev */
  INTERNAL_API_SECRET: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().min(16).optional()
  ),

  /** Optional: if set, POST /api/workflows/audit must send header x-msa-webhook-secret with this value. */
  MSA_INTERNAL_WEBHOOK_SECRET: z
    .preprocess((v) => (v === "" || v === undefined ? undefined : v), z.string().min(8).optional()),

  /** Replicate — AI image hosting (jersey/stadium mockups). Optional until Ruhani provides token. */
  REPLICATE_API_TOKEN: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().min(10).optional()
  ),

  /** Slack Incoming Webhook — internal team notifications (approvals, spend-cap hits,
   * gone-cold nudges). Optional; notifications are silently skipped until it's set —
   * see lib/slack/notify.ts. */
  SLACK_WEBHOOK_URL: z.preprocess(
    (v) => (v === "" || v === undefined ? undefined : v),
    z.string().url().optional()
  ),
});

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

let cachedServer: z.infer<typeof serverSchema> | undefined;
let cachedPublic: z.infer<typeof publicSchema> | undefined;

export function serverEnv() {
  if (cachedServer) return cachedServer;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server env: ${issues}`);
  }
  cachedServer = parsed.data;
  return cachedServer;
}

export function publicEnv() {
  if (cachedPublic) return cachedPublic;
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid public env: ${issues}`);
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}
