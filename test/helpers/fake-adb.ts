import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AdbExecutor, AdbResult, RunAdbOptions } from "../../src/adb/executor.js";

const FIXTURE_DIR = dirname(fileURLToPath(import.meta.url));
export const WINDOW_DUMP = readFileSync(join(FIXTURE_DIR, "../fixtures/window_dump.xml"));

export const MIN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export function ok(stdout: string | Buffer, stderr = ""): AdbResult {
  return {
    stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout),
    stderr,
    code: 0,
  };
}

export function fail(stderr: string, code = 1): AdbResult {
  return { stdout: Buffer.from(""), stderr, code };
}

function stripSerial(args: string[]): string[] {
  if (args[0] === "-s") {
    return args.slice(2);
  }
  return args;
}

export class FakeAdb implements AdbExecutor {
  readonly calls: string[][] = [];
  devicesOutput =
    "List of devices attached\nemulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:1\n";
  dumpXml: Buffer = WINDOW_DUMP;
  screenshot: Buffer = MIN_PNG;
  clipboardOk = true;
  failDump = false;

  async run(args: string[], _options?: RunAdbOptions): Promise<AdbResult> {
    this.calls.push(args);
    const cmd = stripSerial(args);
    const joined = cmd.join(" ");

    if (joined === "devices -l") {
      return ok(this.devicesOutput);
    }
    if (joined === "shell getprop ro.product.model") {
      return ok("sdk_gphone64_arm64\n");
    }
    if (joined === "shell getprop ro.build.version.release") {
      return ok("14\n");
    }
    if (joined === "shell wm size") {
      return ok("Physical size: 1080x2400\n");
    }
    if (joined === "shell dumpsys window") {
      return ok(
        "mCurrentFocus=Window{abc u0 com.android.launcher3/com.android.launcher3.uioverrides.QuickstepLauncher}\n",
      );
    }
    if (joined.startsWith("shell uiautomator dump")) {
      if (this.failDump) {
        return fail("ERROR: null root node returned by UiTestAutomationBridge.");
      }
      return ok("UI hierchary dumped to: /data/local/tmp/android-phone-mcp-uidump.xml\n");
    }
    if (joined === "exec-out cat /data/local/tmp/android-phone-mcp-uidump.xml") {
      if (this.failDump) {
        return fail("No such file");
      }
      return ok(this.dumpXml);
    }
    if (joined === "exec-out screencap -p") {
      return ok(this.screenshot);
    }
    if (joined.startsWith("shell input tap")) {
      return ok("");
    }
    if (joined.startsWith("shell input swipe")) {
      return ok("");
    }
    if (joined.startsWith("shell input text")) {
      return ok("");
    }
    if (joined.startsWith("shell input keyevent")) {
      return ok("");
    }
    if (joined.startsWith("shell cmd clipboard set-text")) {
      return this.clipboardOk ? ok("") : fail("Unknown command");
    }
    if (joined.startsWith("shell am start")) {
      return ok("Starting: Intent { act=android.intent.action.MAIN }\n");
    }
    if (joined.startsWith("shell monkey")) {
      return ok("Events injected: 1\n");
    }
    if (joined.includes("query-activities")) {
      return ok(
        "priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=false\ncom.android.settings/.Settings\ncom.android.chrome/.Main\n",
      );
    }
    if (joined === "shell pm list packages -3") {
      return ok("package:com.android.chrome\npackage:com.android.settings\n");
    }

    return fail(`unexpected adb ${joined}`);
  }
}
