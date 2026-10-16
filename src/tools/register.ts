import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { devicesPayload, type ObserveResult, type PhoneSession } from "../session.js";

const settle = z.number().int().min(0).max(15_000).optional().describe("Wait before re-observing, milliseconds");
const observeFlag = z.boolean().optional().describe("Re-dump the UI after the action (default true)");
const screenshotFlag = z.boolean().optional().describe("Include a PNG screenshot in the response");
const index = z.number().int().min(0).optional().describe("Element index from the last phone_observe list");
const textSel = z.string().optional().describe("Match element text or content-desc");
const resourceId = z.string().optional().describe("Android resource-id (full or short)");
const contentDesc = z.string().optional().describe("content-desc exact match");
const className = z.string().optional().describe("Class name substring, e.g. EditText");
const packageName = z.string().optional().describe("Owning package name");

export function registerPhoneTools(server: McpServer, session: PhoneSession): void {
  server.registerTool(
    "phone_connect",
    {
      title: "Connect Android device",
      description:
        "List ADB devices (emulator or USB), select one, and return a compact current-screen summary. Call this first. Pass device as an ADB serial, or set ANDROID_SERIAL.",
      inputSchema: {
        device: z.string().optional().describe("ADB serial, e.g. emulator-5554"),
      },
    },
    async ({ device }) => {
      try {
        const result = await session.connect(device);
        const body = {
          message: result.message,
          selected: result.selected?.serial,
          devices: devicesPayload(result.devices),
        };
        return observeToTool(result.observe, JSON.stringify(body, null, 2));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "phone_devices",
    {
      title: "List ADB devices",
      description: "List connected ADB devices without changing the current selection or dumping the UI.",
      inputSchema: {},
    },
    async () => {
      try {
        const devices = await session.listDevices();
        return toolText({
          selected: session.selectedSerial,
          devices: devicesPayload(devices),
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "phone_observe",
    {
      title: "Observe screen UI",
      description:
        "Capture the current UI hierarchy via uiautomator dump (accessibility-style tree) and return a numbered element list for tapping. Set includeScreenshot when the tree is not enough (games, canvas, Chrome content).",
      inputSchema: {
        includeScreenshot: screenshotFlag,
      },
    },
    async ({ includeScreenshot }) => {
      try {
        return observeToTool(await session.observe({ includeScreenshot }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "phone_tap",
    {
      title: "Tap screen",
      description:
        "Tap by pixel coordinates (x,y) or by an element from the last phone_observe (index, text, resourceId, contentDesc). Optional durationMs performs a long-press. Returns the resulting screen.",
      inputSchema: {
        x: z.number().optional(),
        y: z.number().optional(),
        index,
        text: textSel,
        textContains: z.boolean().optional(),
        resourceId,
        contentDesc,
        className,
        packageName,
        durationMs: z.number().int().min(0).max(60_000).optional().describe("Long-press duration"),
        settleMs: settle,
        observe: observeFlag,
        includeScreenshot: screenshotFlag,
      },
    },
    async (args) => {
      try {
        return resultToTool(await session.tap(args));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "phone_swipe",
    {
      title: "Swipe",
      description:
        "Swipe from (x1,y1) to (x2,y2), or by finger direction up/down/left/right across the screen. Returns the resulting screen.",
      inputSchema: {
        x1: z.number().optional(),
        y1: z.number().optional(),
        x2: z.number().optional(),
        y2: z.number().optional(),
        direction: z.enum(["up", "down", "left", "right"]).optional(),
        durationMs: z.number().int().min(1).max(10_000).optional(),
        distance: z.number().min(0.2).max(0.9).optional().describe("Fraction of screen for direction swipes"),
        settleMs: settle,
        observe: observeFlag,
        includeScreenshot: screenshotFlag,
      },
    },
    async (args) => {
      try {
        return resultToTool(await session.swipe(args));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "phone_type",
    {
      title: "Type text",
      description:
        "Type into the focused field. Optionally tap a selector first. ASCII uses adb input text; other characters use clipboard paste. Returns the resulting screen.",
      inputSchema: {
        text: z.string().describe("Text to type"),
        clear: z.boolean().optional().describe("Delete existing field contents first"),
        index: index.describe("Optional: tap this observe-index field before typing"),
        resourceId,
        contentDesc,
        className,
        packageName,
        settleMs: settle,
        observe: observeFlag,
        includeScreenshot: screenshotFlag,
      },
    },
    async (args) => {
      try {
        return resultToTool(await session.type(args));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "phone_key",
    {
      title: "Send key event",
      description:
        "Send an Android keyevent such as HOME, BACK, ENTER, TAB, DELETE, APP_SWITCH, POWER, VOLUME_UP, VOLUME_DOWN, DPAD_UP/DOWN/LEFT/RIGHT, PASTE. Returns the resulting screen.",
      inputSchema: {
        key: z.string().describe("Key name or KEYCODE_* or numeric keycode"),
        settleMs: settle,
        observe: observeFlag,
        includeScreenshot: screenshotFlag,
      },
    },
    async (args) => {
      try {
        return resultToTool(await session.key(args));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "phone_back",
    {
      title: "Back",
      description: "Press BACK (convenience wrapper around phone_key).",
      inputSchema: {
        settleMs: settle,
        observe: observeFlag,
        includeScreenshot: screenshotFlag,
      },
    },
    async (args) => {
      try {
        return resultToTool(await session.key({ key: "BACK", ...args }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "phone_home",
    {
      title: "Home",
      description: "Press HOME (convenience wrapper around phone_key).",
      inputSchema: {
        settleMs: settle,
        observe: observeFlag,
        includeScreenshot: screenshotFlag,
      },
    },
    async (args) => {
      try {
        return resultToTool(await session.key({ key: "HOME", ...args }));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "phone_launch",
    {
      title: "Launch app",
      description:
        "Launch an app by package (com.android.settings), component (pkg/.Activity), or known alias (settings, chrome, camera, photos, gmail, play, files, clock, calculator, phone, messages).",
      inputSchema: {
        app: z.string().describe("Package, component, or alias"),
        settleMs: settle,
        observe: observeFlag,
        includeScreenshot: screenshotFlag,
      },
    },
    async (args) => {
      try {
        return resultToTool(await session.launch(args));
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "phone_apps",
    {
      title: "List launchable apps",
      description: "List installed launcher activities (package + activity) on the selected device.",
      inputSchema: {},
    },
    async () => {
      try {
        return toolText(await session.apps());
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "phone_screenshot",
    {
      title: "Screenshot",
      description: "Capture a PNG screenshot of the current display.",
      inputSchema: {},
    },
    async () => {
      try {
        const shot = await session.screenshot();
        return {
          content: [
            { type: "text", text: `screenshot ${shot.serial} ${shot.png.length} bytes` },
            {
              type: "image",
              data: shot.png.toString("base64"),
              mimeType: "image/png",
            },
          ],
        };
      } catch (error) {
        return toolError(error);
      }
    },
  );
}

function isObserveResult(value: unknown): value is ObserveResult {
  return Boolean(value && typeof value === "object" && "compact" in value && "elements" in value);
}

function resultToTool(value: ObserveResult | object): CallToolResult {
  if (isObserveResult(value)) {
    return observeToTool(value);
  }
  return toolText(value);
}

function observeToTool(observe: ObserveResult | undefined, prefix?: string): CallToolResult {
  const text = [prefix, observe?.compact].filter(Boolean).join("\n\n");
  const content: CallToolResult["content"] = [{ type: "text", text: text || "(no screen data)" }];
  if (observe?.screenshotPng) {
    content.push({
      type: "image",
      data: observe.screenshotPng.toString("base64"),
      mimeType: "image/png",
    });
  }
  return { content };
}

function toolText(value: unknown): CallToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function toolError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: "text", text: message }], isError: true };
}
