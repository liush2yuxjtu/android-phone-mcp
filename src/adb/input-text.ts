const SAFE_INPUT = /^[A-Za-z0-9._:@/+*,?!#= -]+$/;

export function isAdbInputSafe(text: string): boolean {
  return SAFE_INPUT.test(text);
}

/** Encode a conservative ASCII string for `adb shell input text`. */
export function encodeAdbInput(text: string): string {
  return text.replace(/ /g, "%s");
}

export function chunkText(text: string, size = 60): string[] {
  if (text.length === 0) {
    return [];
  }
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

export type TypeMethod = "input" | "chunked" | "clipboard" | "empty";

export function planTypeMethod(text: string): TypeMethod {
  if (text.length === 0) {
    return "empty";
  }
  if (!isAdbInputSafe(text)) {
    return "clipboard";
  }
  return text.length <= 80 ? "input" : "chunked";
}
