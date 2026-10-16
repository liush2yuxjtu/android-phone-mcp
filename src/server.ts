import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AdbExecutor } from "./adb/executor.js";
import { PhoneSession } from "./session.js";
import { registerPhoneTools } from "./tools/register.js";
import { VERSION } from "./util.js";

export interface CreateServerOptions {
  executor?: AdbExecutor;
  env?: NodeJS.ProcessEnv;
  session?: PhoneSession;
}

export function createPhoneMcpServer(options: CreateServerOptions = {}): McpServer {
  const session = options.session ?? new PhoneSession({ executor: options.executor, env: options.env });
  const server = new McpServer(
    {
      name: "android-phone-mcp",
      version: VERSION,
    },
    {
      instructions:
        "ADB MCP server for an Android emulator or USB device. Not AndroMeld and not affiliated with it; tool names match the public AndroMeld MCP list so clients can swap config. Call phone_connect first, then phone_observe, then tap/swipe/type/key/launch using element indexes from the last observe. Set ANDROID_SERIAL when multiple devices are attached.",
    },
  );
  registerPhoneTools(server, session);
  return server;
}
