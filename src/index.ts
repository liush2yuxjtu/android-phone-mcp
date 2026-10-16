#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPhoneMcpServer } from "./server.js";

async function main(): Promise<void> {
  const server = createPhoneMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
