import { clip } from "../util.js";

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface UiElement {
  index: number;
  text: string;
  contentDesc: string;
  resourceId: string;
  className: string;
  packageName: string;
  clickable: boolean;
  longClickable: boolean;
  checkable: boolean;
  checked: boolean;
  enabled: boolean;
  focused: boolean;
  scrollable: boolean;
  password: boolean;
  selected: boolean;
  bounds: Bounds;
  center: { x: number; y: number };
}

export interface HierarchyDump {
  rotation?: number;
  elements: UiElement[];
}

const NODE_RE = /<node\b([^>]*)\/?>/gi;
const ATTR_RE = /([A-Za-z0-9_:.-]+)="([^"]*)"/g;
const BOUNDS_RE = /\[(\-?\d+),(\-?\d+)\]\[(\-?\d+),(\-?\d+)\]/;

export function parseUiHierarchy(xml: string): HierarchyDump {
  const rotationMatch = xml.match(/<hierarchy\b[^>]*\brotation="(\d+)"/i);
  const rotation = rotationMatch ? Number(rotationMatch[1]) : undefined;
  const raw: Omit<UiElement, "index">[] = [];

  for (const match of xml.matchAll(NODE_RE)) {
    const attrs = parseAttrs(match[1] ?? "");
    const bounds = parseBounds(attrs.bounds ?? "");
    if (!bounds) {
      continue;
    }
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    if (width <= 0 || height <= 0) {
      continue;
    }
    const element: Omit<UiElement, "index"> = {
      text: attrs.text ?? "",
      contentDesc: attrs["content-desc"] ?? "",
      resourceId: attrs["resource-id"] ?? "",
      className: attrs.class ?? "",
      packageName: attrs.package ?? "",
      clickable: isTrue(attrs.clickable),
      longClickable: isTrue(attrs["long-clickable"]),
      checkable: isTrue(attrs.checkable),
      checked: isTrue(attrs.checked),
      enabled: attrs.enabled === undefined ? true : isTrue(attrs.enabled),
      focused: isTrue(attrs.focused),
      scrollable: isTrue(attrs.scrollable),
      password: isTrue(attrs.password),
      selected: isTrue(attrs.selected),
      bounds,
      center: {
        x: Math.round((bounds.left + bounds.right) / 2),
        y: Math.round((bounds.top + bounds.bottom) / 2),
      },
    };
    if (shouldKeep(element)) {
      raw.push(element);
    }
  }

  const elements = raw.map((item, index) => ({ ...item, index }));
  return { rotation, elements };
}

export function formatCompactScreen(options: {
  serial: string;
  model?: string;
  androidVersion?: string;
  width?: number;
  height?: number;
  rotation?: number;
  focused?: string;
  elements: UiElement[];
  dumpError?: string;
}): string {
  const headerBits = [options.serial];
  if (options.model) {
    headerBits.push(options.model);
  }
  if (options.androidVersion) {
    headerBits.push(`Android ${options.androidVersion}`);
  }
  if (options.width && options.height) {
    headerBits.push(`${options.width}x${options.height}`);
  }
  if (options.rotation !== undefined) {
    headerBits.push(`rot=${options.rotation}`);
  }
  const lines = [headerBits.join(" · ")];
  if (options.focused) {
    lines.push(`focus: ${clip(options.focused, 160)}`);
  }
  if (options.dumpError) {
    lines.push(`dump error: ${options.dumpError}`);
  }
  lines.push(`elements (${options.elements.length}):`);
  for (const el of options.elements) {
    lines.push(formatElementLine(el));
  }
  return lines.join("\n");
}

export function formatElementLine(el: UiElement): string {
  const flags: string[] = [];
  if (el.clickable) {
    flags.push("CLICK");
  }
  if (el.longClickable) {
    flags.push("LONG");
  }
  if (el.checkable) {
    flags.push(el.checked ? "CHECKED" : "CHECK");
  }
  if (el.scrollable) {
    flags.push("SCROLL");
  }
  if (el.focused) {
    flags.push("FOCUS");
  }
  if (el.password) {
    flags.push("PASSWORD");
  }
  if (!el.enabled) {
    flags.push("DISABLED");
  }
  const shortClass = (el.className.split(".").pop() ?? el.className) || "View";
  const bits = [`[${el.index}]`, flags.join("/") || "TEXT", shortClass];
  if (el.text) {
    bits.push(`text="${clip(el.text, 60)}"`);
  }
  if (el.contentDesc && el.contentDesc !== el.text) {
    bits.push(`desc="${clip(el.contentDesc, 60)}"`);
  }
  if (el.resourceId) {
    bits.push(`id=${clip(el.resourceId, 80)}`);
  }
  bits.push(`bounds=[${el.bounds.left},${el.bounds.top}][${el.bounds.right},${el.bounds.bottom}]`);
  return bits.join(" ");
}

function shouldKeep(el: Omit<UiElement, "index">): boolean {
  if (el.clickable || el.longClickable || el.checkable || el.scrollable || el.focused) {
    return true;
  }
  if (el.text.trim() || el.contentDesc.trim() || el.resourceId.trim()) {
    return true;
  }
  const cls = el.className;
  return /EditText|Button|CheckBox|Switch|Spinner|SeekBar|TabWidget|WebView/i.test(cls);
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of raw.matchAll(ATTR_RE)) {
    attrs[match[1]!] = decodeXml(match[2] ?? "");
  }
  return attrs;
}

function parseBounds(raw: string): Bounds | undefined {
  const match = raw.match(BOUNDS_RE);
  if (!match) {
    return undefined;
  }
  return {
    left: Number(match[1]),
    top: Number(match[2]),
    right: Number(match[3]),
    bottom: Number(match[4]),
  };
}

function isTrue(value: string | undefined): boolean {
  return value === "true";
}

function decodeXml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
