import { z } from "zod";

export const MaskingOptionsSchema = z.object({
  replaceWith: z.string().optional(),
  maskEntire: z.boolean().optional(),
});

export type MaskingOptions = z.infer<typeof MaskingOptionsSchema>;

const DEFAULT_MASK = "[REDACTED]";

const SENSITIVE_FIELD_PATTERNS = [
  /^password$/i,
  /^passwd$/i,
  /^pwd$/i,
  /^secret$/i,
  /^api[_-]?key$/i,
  /^api[_-]?secret$/i,
  /^access[_-]?token$/i,
  /^refresh[_-]?token$/i,
  /^bearer$/i,
  /^authorization$/i,
  /^auth$/i,
  /^credential$/i,
  /^private[_-]?key$/i,
  /^session[_-]?id$/i,
  /^x[_-]?api[_-]?key$/i,
  /^x[_-]?auth[_-]?token$/i,
];

const SENSITIVE_VALUE_PATTERNS = [
  /^-----BEGIN\s+(RSA|DSA|EC|OPENSSH|PRIVATE\s+KEY)-----/m,
  /^eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
  /^gh[pousr]_[A-Za-z0-9_]{36,}$/,
  /^sk-[A-Za-z0-9]{20,}$/,
  /^sk_live_[A-Za-z0-9]{20,}$/,
  /^AKIA[0-9A-Z]{16}$/,
];

export function isSensitiveField(key: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(key));
}

export function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

export function maskValue(value: unknown, opts: MaskingOptions = {}): unknown {
  const replaceWith = opts.replaceWith ?? DEFAULT_MASK;

  if (typeof value === "string") {
    if (isSensitiveValue(value)) {
      return replaceWith;
    }
    if (opts.maskEntire) {
      return replaceWith;
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskValue(item, opts));
  }

  if (value && typeof value === "object") {
    const masked: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      masked[key] = isSensitiveField(key) ? replaceWith : maskValue(val, opts);
    }
    return masked;
  }

  return value;
}

export function maskObject(
  obj: Record<string, unknown>,
  opts: MaskingOptions = {}
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveField(key)) {
      result[key] = opts.replaceWith ?? DEFAULT_MASK;
    } else if (typeof value === "object" && value !== null) {
      result[key] = maskValue(value, opts);
    } else {
      result[key] = value;
    }
  }

  return result;
}

export function maskSensitiveString(text: string): string {
  return text
    .replace(/(password|passwd|pwd|secret|api[_-]?key|api[_-]?secret|token)\s*[:=]\s*["']?([^"'\s]+)["']?/gi, "$1=[REDACTED]")
    .replace(/(-----BEGIN\s+(RSA|DSA|EC|OPENSSH|PRIVATE\s+KEY)-----[\s\S]*?-----END\s+\2-----)/g, "[PRIVATE KEY REDACTED]")
    .replace(/(sk-[A-Za-z0-9]{20,})/g, "[API KEY REDACTED]")
    .replace(/(gh[pousr]_[A-Za-z0-9_]{36,})/g, "[GITHUB TOKEN REDACTED]")
    .replace(/(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g, "[JWT REDACTED]");
}

export function maskCommandOutput(output: unknown): unknown {
  if (typeof output === "string") {
    return output
      .replace(/(password|passwd|pwd|secret|api[_-]?key|api[_-]?secret|token)\s*[:=]\s*["']?[^"'\s]+["']?/gi, "$1=[REDACTED]")
      .replace(/(-----BEGIN\s+(RSA|DSA|EC|OPENSSH|PRIVATE\s+KEY)-----[\s\S]*?-----END\s+\2-----)/g, "[PRIVATE KEY REDACTED]")
      .replace(/(sk-[A-Za-z0-9]{20,})/g, "[API KEY REDACTED]")
      .replace(/(gh[pousr]_[A-Za-z0-9_]{36,})/g, "[GITHUB TOKEN REDACTED]");
  }

  if (Array.isArray(output)) {
    return output.map((item) => maskCommandOutput(item));
  }

  if (output && typeof output === "object") {
    return maskObject(output as Record<string, unknown>);
  }

  return output;
}
