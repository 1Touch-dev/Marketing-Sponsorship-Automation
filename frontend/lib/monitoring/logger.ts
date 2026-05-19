/**
 * Structured logger for production monitoring.
 * Outputs JSON logs in production, readable logs in development.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = {
  route?: string;
  duration_ms?: number;
  user_id?: string;
  company_id?: string;
  proposal_id?: string;
  model?: string;
  tokens?: number;
  error?: string;
  [key: string]: unknown;
};

const isDev = process.env.NODE_ENV !== "production";

function log(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: "market-sponsorship",
    env: process.env.NODE_ENV,
    ...context,
  };

  if (isDev) {
    const prefix = { debug: "🔍", info: "ℹ️", warn: "⚠️", error: "❌" }[level];
    const ctx = context ? ` ${JSON.stringify(context, null, 0)}` : "";
    console[level === "debug" ? "log" : level](`${prefix} [${level.toUpperCase()}] ${message}${ctx}`);
  } else {
    // In production, output structured JSON for log aggregation
    console.log(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => log("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => log("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => log("error", msg, ctx),

  /** Track API performance */
  apiTiming: (route: string, durationMs: number, status: number) => {
    const level: LogLevel = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
    log(level, `API ${route} → ${status}`, { route, duration_ms: durationMs, status });
  },

  /** Track AI generation metrics */
  aiGeneration: (model: string, action: string, durationMs: number, success: boolean, tokens?: number) => {
    log(success ? "info" : "warn", `AI ${action} ${success ? "succeeded" : "failed"}`, {
      model, action, duration_ms: durationMs, tokens, success,
    });
  },

  /** Track errors with context */
  apiError: (route: string, error: Error | unknown, context?: LogContext) => {
    log("error", `API error: ${route}`, {
      route,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack?.split("\n").slice(0, 3).join(" | ") : undefined,
      ...context,
    });
  },
};
