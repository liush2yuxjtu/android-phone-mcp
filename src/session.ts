import { AdbClient } from "./adb/client.js";
import { type AdbDevice, formatDevice } from "./adb/devices.js";
import type { AdbExecutor } from "./adb/executor.js";
import { parseLaunchableApps, resolveLaunchTarget, type LaunchableApp } from "./apps/launchable.js";
import {
  formatCompactScreen,
  parseUiHierarchy,
  type UiElement,
} from "./ui/hierarchy.js";
import { selectElement, selectorFromArgs, type ElementSelector } from "./ui/select.js";
import { requireInt, sleep } from "./util.js";

export interface PhoneSessionOptions {
  executor?: AdbExecutor;
  env?: NodeJS.ProcessEnv;
  adb?: AdbClient;
}

export interface ObserveOptions {
  includeScreenshot?: boolean;
}

export interface ObserveResult {
  serial: string;
  model?: string;
  androidVersion?: string;
  screen?: { width: number; height: number };
  rotation?: number;
  focused?: string;
  elements: UiElement[];
  compact: string;
  dumpError?: string;
  screenshotPng?: Buffer;
}

export interface ActionOptions extends ObserveOptions {
  settleMs?: number;
  observe?: boolean;
}

export class PhoneSession {
  private readonly env: NodeJS.ProcessEnv;
  private readonly base: AdbClient;
  private selected?: string;
  private lastElements: UiElement[] = [];

  constructor(options: PhoneSessionOptions = {}) {
    this.env = options.env ?? process.env;
    this.base = options.adb ?? new AdbClient({ executor: options.executor });
  }

  get selectedSerial(): string | undefined {
    return this.selected;
  }

  async listDevices(): Promise<AdbDevice[]> {
    return this.base.devices();
  }

  async connect(device?: string): Promise<{
    devices: AdbDevice[];
    selected?: AdbDevice;
    observe?: ObserveResult;
    message: string;
  }> {
    const devices = await this.listDevices();
    const requested = device?.trim() || this.env.ANDROID_SERIAL?.trim() || this.selected;
    const online = devices.filter((item) => item.state === "device");

    if (devices.length === 0) {
      return {
        devices,
        message:
          "No ADB devices found. Start an emulator (`emulator -avd <name>`) or connect a phone with USB debugging, then rerun phone_connect.",
      };
    }

    if (requested) {
      const match = devices.find((item) => item.serial === requested);
      if (!match) {
        return {
          devices,
          message: `Device ${requested} is not connected. Available: ${devices.map(formatDevice).join("; ")}`,
        };
      }
      if (match.state !== "device") {
        return {
          devices,
          selected: match,
          message: `Device ${requested} is ${match.state}. Unlock it and authorize this computer if needed.`,
        };
      }
      this.selected = match.serial;
      const observe = await this.observe();
      return {
        devices,
        selected: match,
        observe,
        message: `Connected to ${formatDevice(match)}`,
      };
    }

    if (online.length === 1) {
      const match = online[0]!;
      this.selected = match.serial;
      const observe = await this.observe();
      return {
        devices,
        selected: match,
        observe,
        message: `Connected to ${formatDevice(match)}`,
      };
    }

    return {
      devices,
      message: `Multiple devices connected. Pass device=<serial> or set ANDROID_SERIAL. ${devices.map(formatDevice).join("; ")}`,
    };
  }

  async observe(options: ObserveOptions = {}): Promise<ObserveResult> {
    const adb = await this.requireDevice();
    const serial = adb.serial!;
    const [model, androidVersion, size, focused] = await Promise.all([
      adb.getprop("ro.product.model").catch(() => ""),
      adb.getprop("ro.build.version.release").catch(() => ""),
      adb.wmSize().catch(() => undefined),
      adb.currentFocus().catch(() => undefined),
    ]);

    let elements: UiElement[] = [];
    let rotation: number | undefined;
    let dumpError: string | undefined;
    try {
      const xml = await adb.dumpUiHierarchy();
      const parsed = parseUiHierarchy(xml);
      elements = parsed.elements;
      rotation = parsed.rotation;
      this.lastElements = elements;
    } catch (error) {
      dumpError = error instanceof Error ? error.message : String(error);
      this.lastElements = [];
    }

    let screenshotPng: Buffer | undefined;
    if (options.includeScreenshot || dumpError) {
      try {
        screenshotPng = await adb.screenshotPng();
      } catch (error) {
        const shotError = error instanceof Error ? error.message : String(error);
        dumpError = dumpError ? `${dumpError}; screenshot failed: ${shotError}` : `screenshot failed: ${shotError}`;
      }
    }

    const compact = formatCompactScreen({
      serial,
      model: model || undefined,
      androidVersion: androidVersion || undefined,
      width: size?.width,
      height: size?.height,
      rotation,
      focused,
      elements,
      dumpError,
    });

    return {
      serial,
      model: model || undefined,
      androidVersion: androidVersion || undefined,
      screen: size ? { width: size.width, height: size.height } : undefined,
      rotation,
      focused,
      elements,
      compact,
      dumpError,
      screenshotPng,
    };
  }

  async tap(args: {
    x?: number;
    y?: number;
    durationMs?: number;
  } & ElementSelector & ActionOptions): Promise<ObserveResult | { tapped: { x: number; y: number } }> {
    const adb = await this.requireDevice();
    const point = await this.resolvePoint(args);
    const durationMs = args.durationMs ?? 0;
    if (durationMs > 0) {
      await adb.longPress(point.x, point.y, durationMs);
    } else {
      await adb.tap(point.x, point.y);
    }
    return this.afterAction(args, { tapped: point });
  }

  async swipe(args: {
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
    direction?: "up" | "down" | "left" | "right";
    durationMs?: number;
    distance?: number;
  } & ActionOptions): Promise<ObserveResult | { swiped: Record<string, number | string> }> {
    const adb = await this.requireDevice();
    const durationMs = args.durationMs ?? 300;
    let x1: number;
    let y1: number;
    let x2: number;
    let y2: number;

    if (
      args.x1 !== undefined &&
      args.y1 !== undefined &&
      args.x2 !== undefined &&
      args.y2 !== undefined
    ) {
      x1 = requireInt(args.x1, "x1");
      y1 = requireInt(args.y1, "y1");
      x2 = requireInt(args.x2, "x2");
      y2 = requireInt(args.y2, "y2");
    } else if (args.direction) {
      const size = await adb.wmSize();
      const distance = Math.min(0.9, Math.max(0.2, args.distance ?? 0.55));
      const cx = Math.round(size.width / 2);
      const cy = Math.round(size.height / 2);
      const dx = Math.round(size.width * distance * 0.5);
      const dy = Math.round(size.height * distance * 0.5);
      switch (args.direction) {
        case "up":
          x1 = cx;
          y1 = cy + dy;
          x2 = cx;
          y2 = cy - dy;
          break;
        case "down":
          x1 = cx;
          y1 = cy - dy;
          x2 = cx;
          y2 = cy + dy;
          break;
        case "left":
          x1 = cx + dx;
          y1 = cy;
          x2 = cx - dx;
          y2 = cy;
          break;
        case "right":
          x1 = cx - dx;
          y1 = cy;
          x2 = cx + dx;
          y2 = cy;
          break;
        default:
          throw new Error(`Unknown swipe direction: ${args.direction}`);
      }
    } else {
      throw new Error("Provide x1,y1,x2,y2 or direction (up/down/left/right)");
    }

    await adb.swipe(x1, y1, x2, y2, durationMs);
    return this.afterAction(args, { swiped: { x1, y1, x2, y2, durationMs } });
  }

  async type(
    args: {
      text: string;
      clear?: boolean;
      index?: number;
      resourceId?: string;
      contentDesc?: string;
      className?: string;
      packageName?: string;
    } & ActionOptions,
  ): Promise<ObserveResult | { typed: string; method: string }> {
    const adb = await this.requireDevice();
    const selector = selectorFromArgs({
      index: args.index,
      resourceId: args.resourceId,
      contentDesc: args.contentDesc,
      className: args.className,
      packageName: args.packageName,
    });
    if (selector) {
      const el = selectElement(this.requireSnapshot(selector), selector);
      await adb.tap(el.center.x, el.center.y);
      await sleep(120);
    }
    if (args.clear) {
      await adb.keyevent("MOVE_END");
      for (let i = 0; i < 40; i += 1) {
        await adb.keyevent("DEL");
      }
    }
    const method = await adb.typeText(args.text);
    return this.afterAction(args, { typed: args.text, method });
  }

  async key(args: { key: string } & ActionOptions): Promise<ObserveResult | { key: string }> {
    const adb = await this.requireDevice();
    const key = await adb.keyevent(args.key);
    return this.afterAction(args, { key });
  }

  async launch(args: { app: string } & ActionOptions): Promise<ObserveResult | { launched: string }> {
    const adb = await this.requireDevice();
    let apps: LaunchableApp[] = [];
    try {
      apps = parseLaunchableApps(await adb.queryLauncherActivities());
    } catch {
      apps = [];
    }
    const target = resolveLaunchTarget(args.app, apps);
    let launched: string;
    if (target.component) {
      launched = await adb.launchComponent(target.component);
    } else {
      launched = await adb.launchPackage(target.packageName!);
    }
    return this.afterAction({ ...args, settleMs: args.settleMs ?? 800 }, { launched });
  }

  async apps(): Promise<{ serial: string; apps: LaunchableApp[] }> {
    const adb = await this.requireDevice();
    const apps = parseLaunchableApps(await adb.queryLauncherActivities());
    return { serial: adb.serial!, apps };
  }

  async screenshot(): Promise<{ serial: string; png: Buffer }> {
    const adb = await this.requireDevice();
    const png = await adb.screenshotPng();
    return { serial: adb.serial!, png };
  }

  private async resolvePoint(args: { x?: number; y?: number } & ElementSelector): Promise<{ x: number; y: number }> {
    if (args.x !== undefined && args.y !== undefined) {
      return { x: requireInt(args.x, "x"), y: requireInt(args.y, "y") };
    }
    const selector = selectorFromArgs(args);
    if (!selector) {
      throw new Error("Provide x and y, or an element selector from the last phone_observe (index/text/resourceId/contentDesc)");
    }
    let elements = this.lastElements;
    if (elements.length === 0) {
      const observed = await this.observe();
      elements = observed.elements;
    }
    const el = selectElement(elements, selector);
    return el.center;
  }

  private requireSnapshot(selector: ElementSelector): UiElement[] {
    if (this.lastElements.length === 0) {
      throw new Error(
        `No UI snapshot yet for selector ${JSON.stringify(selector)}. Call phone_observe or phone_connect first.`,
      );
    }
    return this.lastElements;
  }

  private async afterAction<T extends object>(
    options: ActionOptions,
    summary: T,
  ): Promise<ObserveResult | T> {
    const settleMs = options.settleMs ?? 400;
    if (settleMs > 0) {
      await sleep(settleMs);
    }
    if (options.observe === false) {
      return summary;
    }
    const observed = await this.observe({ includeScreenshot: options.includeScreenshot });
    observed.compact = `${JSON.stringify(summary)}\n${observed.compact}`;
    return observed;
  }

  private async requireDevice(): Promise<AdbClient> {
    if (!this.selected) {
      const envSerial = this.env.ANDROID_SERIAL?.trim();
      const devices = await this.listDevices();
      const online = devices.filter((item) => item.state === "device");
      if (envSerial && online.some((item) => item.serial === envSerial)) {
        this.selected = envSerial;
      } else if (online.length === 1) {
        this.selected = online[0]!.serial;
      } else if (online.length === 0) {
        throw new Error(
          "No online ADB device. Start an emulator or connect a USB device, then call phone_connect.",
        );
      } else {
        throw new Error(
          `Multiple ADB devices: ${online.map((item) => item.serial).join(", ")}. Call phone_connect with device=<serial> or set ANDROID_SERIAL.`,
        );
      }
    }
    return this.base.withSerial(this.selected);
  }
}

export function devicesPayload(devices: AdbDevice[]) {
  return devices.map((device) => ({
    serial: device.serial,
    state: device.state,
    model: device.model,
    product: device.product,
    summary: formatDevice(device),
  }));
}
