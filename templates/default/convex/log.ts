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

// JSON.stringify replacer: Errors don't serialize by default. Pull
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

// Web crypto is available in Convex's runtime. 9 bytes → 12-char base64url.
export function newRequestId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
