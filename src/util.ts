export const VERSION = "0.1.0";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function decodeUtf8(buffer: Buffer): string {
  return buffer.toString("utf8").replace(/^\uFEFF/, "");
}

export function clip(text: string, max = 80): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 1)}…`;
}

export function requireInt(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
  return Math.round(value);
}
