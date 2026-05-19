/**
 * Runtime environment validation.
 * Call validateEnv() on startup to catch misconfiguration early.
 */

type EnvStatus = {
  key: string;
  status: "ok" | "missing" | "invalid";
  required: boolean;
  message?: string;
};

export function validateEnv(): { valid: boolean; statuses: EnvStatus[]; summary: string } {
  const checks: Array<{ key: string; required: boolean; validate?: (v: string) => boolean; hint?: string }> = [
    { key: "NEXT_PUBLIC_SUPABASE_URL", required: true, validate: v => v.startsWith("https://") },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", required: true, validate: v => v.length > 20 },
    { key: "SUPABASE_SERVICE_ROLE_KEY", required: true, validate: v => v.length > 20 },
    { key: "SUPABASE_DB_PASSWORD", required: false },
    { key: "AWS_REGION", required: false, validate: v => /^[a-z]+-[a-z]+-\d+$/.test(v) },
    { key: "AWS_ACCESS_KEY_ID", required: false, validate: v => v.startsWith("AKIA") || v.startsWith("ASIA") },
    { key: "AWS_SECRET_ACCESS_KEY", required: false, validate: v => v.length > 20 },
    { key: "BEDROCK_MODEL_ID", required: false },
    { key: "OPENAI_API_KEY", required: false, validate: v => v.startsWith("sk-") },
    { key: "PIPEDRIVE_API_KEY", required: false },
    { key: "NEXTAUTH_SECRET", required: false },
  ];

  const statuses: EnvStatus[] = checks.map(({ key, required, validate, hint }) => {
    const value = process.env[key];
    if (!value || value.trim() === "") {
      return { key, required, status: required ? "missing" : "missing", message: hint ?? (required ? "REQUIRED — set this now" : "Optional — not configured") };
    }
    if (validate && !validate(value)) {
      return { key, required, status: "invalid" as const, message: "Value present but may be invalid" };
    }
    return { key, required, status: "ok" as const };
  });

  const missing = statuses.filter(s => s.required && s.status === "missing");
  const invalid = statuses.filter(s => s.status === "invalid");

  const valid = missing.length === 0;
  const summary = valid
    ? `✅ All required env vars present (${invalid.length > 0 ? `${invalid.length} potentially invalid` : "all valid"})`
    : `❌ Missing required env vars: ${missing.map(s => s.key).join(", ")}`;

  if (!valid) {
    console.error("[ENV VALIDATION]", summary);
  }

  return { valid, statuses, summary };
}

export function getEnvSummary() {
  const { statuses } = validateEnv();
  return statuses.map(s => ({
    key: s.key,
    configured: s.status === "ok",
    required: s.required,
    status: s.status,
  }));
}
