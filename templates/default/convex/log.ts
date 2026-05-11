// Structured one-line JSON logger for Convex HTTP handlers.
//
// Convex's web dashboard renders `console.log` output line-by-line. Plain
// strings work for narrative logs but lose context once volume grows. The
// helpers below emit single-line JSON with a stable shape so dashboards
// and log aggregators can filter on fields directly:
//
//   { "ts": "...", "level": "info", "event": "webhook.ok", "requestId": "...",
//     "durationMs": 12, "platform": "ios", "status": "finished" }
//
// Keep the field set small and predictable:
//   - ts           ISO timestamp (UTC)
//   - level        info | warn | error
//   - event        dot-namespaced verb ("webhook.ok", "aasa.served")
//   - requestId    set per HTTP request via `newRequestId()`
//   - durationMs   numeric (preferred over Date arithmetic in queries)
//   - err          { message, name, stack? } when level === "error"
//
// Anything else is merged in as-is. Field order is alphabetical except `ts`
// and `level` come first for readability when scrolling raw log output.

export type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, unknown> & {
  event: string;
  requestId?: string;
};

function emit(level: LogLevel, fields: LogFields): void {
  const { event, ...rest } = fields;
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...rest,
  };
  const line = JSON.stringify(payload, replacer);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

// JSON.stringify replacer: errors don't serialize by default. Pull
// `message`, `name`, and (only in development) `stack`.
function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      ...(process.env.NODE_ENV !== "production" && value.stack ? { stack: value.stack } : {}),
    };
  }
  return value;
}

export const log = {
  info(fields: LogFields): void {
    emit("info", fields);
  },
  warn(fields: LogFields): void {
    emit("warn", fields);
  },
  error(fields: LogFields & { err?: unknown }): void {
    emit("error", fields);
  },
};

// Cryptographically-random short request ID. Web crypto is available in
// Convex's runtime. 9 bytes → 12-char base64url, plenty for correlation
// without bloating every log line.
export function newRequestId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
