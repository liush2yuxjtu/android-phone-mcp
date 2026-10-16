import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createPhoneMcpServer } from "../src/server.js";
import { FakeAdb } from "./helpers/fake-adb.js";

const CORE_TOOLS = [
  "phone_connect",
  "phone_observe",
  "phone_tap",
  "phone_swipe",
  "phone_type",
  "phone_key",
  "phone_launch",
  "phone_apps",
];

const EXTRA_TOOLS = ["phone_screenshot", "phone_back", "phone_home", "phone_devices"];

async function connectClient(fake = new FakeAdb()) {
  const server = createPhoneMcpServer({ executor: fake, env: {} });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, fake };
}

describe("MCP server", () => {
  it("exposes AndroMeld-aligned tool names plus extras", async () => {
    const { client } = await connectClient();
    const listed = await client.listTools();
    const names = listed.tools.map((tool) => tool.name);
    for (const name of [...CORE_TOOLS, ...EXTRA_TOOLS]) {
      expect(names).toContain(name);
    }
  });

  it("connects and observes through MCP", async () => {
    const { client } = await connectClient();
    const connected = await client.callTool({ name: "phone_connect", arguments: {} });
    const text = JSON.stringify(connected);
    expect(connected.isError).not.toBe(true);
    expect(text).toContain("emulator-5554");
    expect(text).toContain("Play Store");

    const apps = await client.callTool({ name: "phone_apps", arguments: {} });
    expect(JSON.stringify(apps)).toContain("com.android.settings");
  });

  it("returns a tap error without a selector or coordinates", async () => {
    const { client } = await connectClient();
    await client.callTool({ name: "phone_connect", arguments: {} });
    const tapped = await client.callTool({ name: "phone_tap", arguments: {} });
    expect(tapped.isError).toBe(true);
    expect(JSON.stringify(tapped)).toMatch(/x and y|selector/i);
  });
});
