/**
 * Pattern 7 hardening (master_report.md Section 8 — "single point of
 * failure in backups", precedent: Code Spaces, where one compromised
 * credential destroyed prod AND backups, killing the company).
 *
 * Exports every application table and uploads the bundle to S3 using a
 * SEPARATE credential from production (BACKUP_AWS_* env vars, distinct
 * from the AWS_ACCESS_KEY_ID used for Bedrock) — so a compromise of the
 * production credentials does not also grant access to, or the ability
 * to delete, the backups.
 *
 * Run: npx tsx scripts/run-backup.ts
 * Schedule: via system cron or an n8n Schedule trigger hitting a wrapper
 * that shells out to this script (not wired to a Next.js API route —
 * a full export can run long and doesn't belong in a request/response
 * cycle with maxDuration limits).
 *
 * BACKUP_AWS_ACCESS_KEY_ID / BACKUP_AWS_SECRET_ACCESS_KEY / BACKUP_S3_BUCKET
 * must be provisioned by a human with AWS console access — see
 * docs/DEPLOYMENT_AND_RUNTIME.md "Backups" section for the exact steps
 * (dedicated IAM user, put-only permissions, Object Lock + versioning
 * enabled on the bucket). Until those are set, this script writes the
 * snapshot to local disk instead and prints a loud warning that this is
 * NOT the isolated/offsite/immutable target Pattern 7 requires — a
 * same-box, same-credential copy has the same blast radius as the
 * production database itself.
 */
import { gzipSync } from "node:zlib";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Run outside the Next.js process (plain tsx, e.g. from cron) — the
// Supabase client needs a WebSocket implementation Node 20 doesn't provide
// natively; the Next.js server has one via a bundler polyfill, this script
// doesn't.
import WS from "ws";
(globalThis as unknown as { WebSocket: unknown }).WebSocket = WS;

import { exportDatabaseSnapshot } from "@/lib/backup/export-snapshot";

async function uploadToS3(bundle: Buffer, key: string): Promise<void> {
  const {
    BACKUP_AWS_ACCESS_KEY_ID,
    BACKUP_AWS_SECRET_ACCESS_KEY,
    BACKUP_AWS_REGION,
    BACKUP_S3_BUCKET,
    BACKUP_S3_OBJECT_LOCK_DAYS,
  } = process.env;

  if (!BACKUP_AWS_ACCESS_KEY_ID || !BACKUP_AWS_SECRET_ACCESS_KEY || !BACKUP_S3_BUCKET) {
    const dir = join(process.cwd(), ".local-backups");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const path = join(dir, key.replace(/\//g, "_"));
    writeFileSync(path, bundle);
    console.warn(
      `\n[backup] BACKUP_AWS_* / BACKUP_S3_BUCKET not configured — wrote snapshot locally to ${path} instead.\n` +
        "[backup] WARNING: this is NOT an isolated/offsite/immutable backup — it lives on the same box, " +
        "with no access separation from production. Provision a dedicated IAM identity + Object-Locked S3 " +
        "bucket (see docs/DEPLOYMENT_AND_RUNTIME.md, 'Backups' section) before relying on this for real DR.\n",
    );
    return;
  }

  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({
    region: BACKUP_AWS_REGION || "us-east-1",
    credentials: {
      accessKeyId: BACKUP_AWS_ACCESS_KEY_ID,
      secretAccessKey: BACKUP_AWS_SECRET_ACCESS_KEY,
    },
  });

  const lockDays = BACKUP_S3_OBJECT_LOCK_DAYS ? parseInt(BACKUP_S3_OBJECT_LOCK_DAYS, 10) : null;
  await s3.send(
    new PutObjectCommand({
      Bucket: BACKUP_S3_BUCKET,
      Key: key,
      Body: bundle,
      ContentType: "application/gzip",
      ...(lockDays
        ? {
            ObjectLockMode: "COMPLIANCE" as const,
            ObjectLockRetainUntilDate: new Date(Date.now() + lockDays * 86_400_000),
          }
        : {}),
    }),
  );
  console.log(
    `[backup] uploaded s3://${BACKUP_S3_BUCKET}/${key} (${bundle.length} bytes)` +
      (lockDays ? `, object-locked ${lockDays}d` : ", NOT object-locked — set BACKUP_S3_OBJECT_LOCK_DAYS to enable"),
  );
}

async function main() {
  console.log("[backup] exporting all application tables...");
  const snapshot = await exportDatabaseSnapshot();

  const totalRows = Object.values(snapshot.table_row_counts).reduce((a, b) => a + b, 0);
  const failedTables = Object.keys(snapshot.table_errors);
  console.log(`[backup] exported ${Object.keys(snapshot.tables).length} tables, ${totalRows} rows total.`);
  if (failedTables.length > 0) {
    console.warn(`[backup] ${failedTables.length} table(s) failed to export:`, snapshot.table_errors);
  }

  const bundle = gzipSync(Buffer.from(JSON.stringify(snapshot)));
  const key = `db-snapshots/${snapshot.generated_at.slice(0, 10)}/snapshot-${snapshot.generated_at.replace(/[:.]/g, "-")}.json.gz`;

  await uploadToS3(bundle, key);

  if (failedTables.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[backup] fatal error:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
