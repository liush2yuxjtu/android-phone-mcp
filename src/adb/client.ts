import { type AdbDevice, parseAdbDevices } from "./devices.js";
import {
  type AdbExecutor,
  type AdbResult,
  assertOk,
  createRealAdbExecutor,
} from "./executor.js";
import { chunkText, encodeAdbInput, isAdbInputSafe, type TypeMethod } from "./input-text.js";
import { resolveKeyEvent } from "./keys.js";
import { decodeUtf8 } from "../util.js";

const DUMP_PATH = "/data/local/tmp/android-phone-mcp-uidump.xml";

export interface ScreenSize {
  width: number;
  height: number;
  source: "physical" | "override";
}

export interface AdbClientOptions {
  executor?: AdbExecutor;
  serial?: string;
}

export class AdbClient {
  readonly executor: AdbExecutor;
  serial?: string;

  constructor(options: AdbClientOptions = {}) {
    this.executor = options.executor ?? createRealAdbExecutor();
    this.serial = options.serial;
  }

  withSerial(serial: string | undefined): AdbClient {
    const next = new AdbClient({ executor: this.executor, serial });
    return next;
  }

  async raw(args: string[], options?: { timeoutMs?: number }): Promise<AdbResult> {
    return this.executor.run(args, options);
  }

  async devices(): Promise<AdbDevice[]> {
    const result = await this.executor.run(["devices", "-l"]);
    assertOk(result, ["devices", "-l"], "adb devices");
    return parseAdbDevices(decodeUtf8(result.stdout));
  }

  async shell(command: string[], options?: { timeoutMs?: number }): Promise<AdbResult> {
    const args = this.prefixed(["shell", ...command]);
    return this.executor.run(args, options);
  }

  async shellOk(command: string[], context: string, options?: { timeoutMs?: number }): Promise<string> {
    const args = this.prefixed(["shell", ...command]);
    const result = await this.executor.run(args, options);
    assertOk(result, args, context);
    return decodeUtf8(result.stdout);
  }

  async execOut(command: string[], options?: { timeoutMs?: number }): Promise<AdbResult> {
    const args = this.prefixed(["exec-out", ...command]);
    return this.executor.run(args, options);
  }

  async getprop(key: string): Promise<string> {
    const out = await this.shellOk(["getprop", key], `getprop ${key}`);
    return out.trim();
  }

  async wmSize(): Promise<ScreenSize> {
    const out = await this.shellOk(["wm", "size"], "wm size");
    const override = out.match(/Override size:\s*(\d+)x(\d+)/i);
    if (override) {
      return { width: Number(override[1]), height: Number(override[2]), source: "override" };
    }
    const physical = out.match(/Physical size:\s*(\d+)x(\d+)/i) ?? out.match(/(\d+)x(\d+)/);
    if (!physical) {
      throw new Error(`Could not parse wm size output: ${out.trim()}`);
    }
    return { width: Number(physical[1]), height: Number(physical[2]), source: "physical" };
  }

  async currentFocus(): Promise<string | undefined> {
    const result = await this.shell([
      "dumpsys",
      "window",
    ], { timeoutMs: 15_000 });
    if (result.code !== 0) {
      return undefined;
    }
    const text = decodeUtf8(result.stdout);
    const match =
      text.match(/mCurrentFocus=([^\n]+)/) ??
      text.match(/mFocusedApp=([^\n]+)/) ??
      text.match(/mResumedActivity:\s*([^\n]+)/);
    return match?.[1]?.trim();
  }

  async dumpUiHierarchy(): Promise<string> {
    const dump = await this.shell(["uiautomator", "dump", "--compressed", DUMP_PATH], {
      timeoutMs: 20_000,
    });
    if (dump.code !== 0) {
      const retry = await this.shell(["uiautomator", "dump", DUMP_PATH], { timeoutMs: 20_000 });
      if (retry.code !== 0) {
        throw new Error(
          `uiautomator dump failed: ${(retry.stderr || decodeUtf8(retry.stdout) || dump.stderr).trim()}`,
        );
      }
    }
    const cat = await this.execOut(["cat", DUMP_PATH], { timeoutMs: 15_000 });
    if (cat.code !== 0) {
      throw new Error(`Failed to read UI dump: ${cat.stderr.trim()}`);
    }
    let xml = decodeUtf8(cat.stdout);
    xml = xml.replace(/^[\s\S]*?(<\?xml\b|<hierarchy\b)/, "$1");
    if (!xml.includes("<hierarchy") && !xml.includes("<node")) {
      throw new Error("UI dump did not contain a hierarchy");
    }
    return xml;
  }

  async screenshotPng(): Promise<Buffer> {
    const result = await this.execOut(["screencap", "-p"], { timeoutMs: 20_000 });
    if (result.code !== 0 || result.stdout.length < 16) {
      throw new Error(`screencap failed: ${result.stderr.trim() || "empty output"}`);
    }
    const png = extractPng(result.stdout);
    if (!png) {
      throw new Error("screencap output was not a PNG");
    }
    return png;
  }

  async tap(x: number, y: number): Promise<void> {
    await this.shellOk(["input", "tap", String(x), String(y)], "input tap");
  }

  async longPress(x: number, y: number, durationMs: number): Promise<void> {
    await this.shellOk(
      ["input", "swipe", String(x), String(y), String(x), String(y), String(durationMs)],
      "input long-press",
    );
  }

  async swipe(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    durationMs = 300,
  ): Promise<void> {
    await this.shellOk(
      [
        "input",
        "swipe",
        String(x1),
        String(y1),
        String(x2),
        String(y2),
        String(durationMs),
      ],
      "input swipe",
    );
  }

  async keyevent(key: string): Promise<string> {
    const resolved = resolveKeyEvent(key);
    await this.shellOk(["input", "keyevent", resolved], `keyevent ${resolved}`);
    return resolved;
  }

  async typeText(text: string): Promise<TypeMethod> {
    if (text.length === 0) {
      return "empty";
    }
    if (isAdbInputSafe(text)) {
      const chunks = chunkText(text, 60);
      for (const chunk of chunks) {
        await this.shellOk(["input", "text", encodeAdbInput(chunk)], "input text");
      }
      return chunks.length > 1 ? "chunked" : "input";
    }
    const clip = await this.shell(["cmd", "clipboard", "set-text", text]);
    if (clip.code === 0) {
      await this.shellOk(["input", "keyevent", "KEYCODE_PASTE"], "KEYCODE_PASTE");
      return "clipboard";
    }
    throw new Error(
      `Cannot type this text via adb input (special characters) and clipboard failed: ${clip.stderr.trim()}`,
    );
  }

  async launchPackage(packageName: string): Promise<string> {
    const result = await this.shell([
      "am",
      "start",
      "-a",
      "android.intent.action.MAIN",
      "-c",
      "android.intent.category.LAUNCHER",
      "-p",
      packageName,
    ]);
    const combined = `${decodeUtf8(result.stdout)}\n${result.stderr}`;
    if (result.code === 0 && !/Error/i.test(combined)) {
      return combined.trim();
    }
    const monkey = await this.shell([
      "monkey",
      "-p",
      packageName,
      "-c",
      "android.intent.category.LAUNCHER",
      "1",
    ]);
    if (monkey.code !== 0) {
      throw new Error(
        `Failed to launch ${packageName}: ${(result.stderr || decodeUtf8(result.stdout) || monkey.stderr).trim()}`,
      );
    }
    return decodeUtf8(monkey.stdout).trim() || `launched ${packageName}`;
  }

  async launchComponent(component: string): Promise<string> {
    const out = await this.shellOk(["am", "start", "-n", component], `am start -n ${component}`);
    return out.trim();
  }

  async queryLauncherActivities(): Promise<string> {
    const brief = await this.shell([
      "cmd",
      "package",
      "query-activities",
      "--brief",
      "-a",
      "android.intent.action.MAIN",
      "-c",
      "android.intent.category.LAUNCHER",
    ]);
    if (brief.code === 0 && decodeUtf8(brief.stdout).trim()) {
      return decodeUtf8(brief.stdout);
    }
    const pm = await this.shellOk(["pm", "list", "packages", "-3"], "pm list packages");
    return pm;
  }

  private prefixed(args: string[]): string[] {
    if (this.serial) {
      return ["-s", this.serial, ...args];
    }
    return args;
  }
}

function extractPng(buffer: Buffer): Buffer | undefined {
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const index = buffer.indexOf(pngMagic);
  if (index < 0) {
    return undefined;
  }
  return index === 0 ? buffer : buffer.subarray(index);
}
