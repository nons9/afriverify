#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import { AfriVerifyClient } from './client.js';
import { verifyToolDefs, handleVerifyTool } from './tools/verify.js';
import { vitToolDefs, handleVitTool } from './tools/vit.js';
import { identityToolDefs, handleIdentityTool } from './tools/identity.js';
import { trustToolDefs, handleTrustTool } from './tools/trust.js';

const API_KEY = process.env.AFRIVERIFY_API_KEY;
if (!API_KEY) {
  process.stderr.write('Error: AFRIVERIFY_API_KEY environment variable is required\n');
  process.exit(1);
}

const client = new AfriVerifyClient(API_KEY, process.env.AFRIVERIFY_BASE_URL);

const ALL_TOOLS: Tool[] = [
  ...(verifyToolDefs as unknown as Tool[]),
  ...(vitToolDefs as unknown as Tool[]),
  ...(identityToolDefs as unknown as Tool[]),
  ...(trustToolDefs as unknown as Tool[]),
];

const TOOL_NAMES = new Set(ALL_TOOLS.map((t) => t.name));

const server = new Server(
  { name: 'afriverify', version: '0.1.0' },
  {
    capabilities: { tools: {} },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (!TOOL_NAMES.has(name)) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    let text: string;

    if (name.startsWith('afriverify_verify_')) {
      text = await handleVerifyTool(name, args, client);
    } else if (name.startsWith('afriverify_vit_')) {
      text = await handleVitTool(name, args, client);
    } else if (name.startsWith('afriverify_identity_')) {
      text = await handleIdentityTool(name, args, client);
    } else if (name.startsWith('afriverify_trust_')) {
      text = await handleTrustTool(name, args, client);
    } else {
      throw new Error(`Unhandled tool: ${name}`);
    }

    return { content: [{ type: 'text', text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  process.stderr.write('AfriVerify MCP server running\n');
});
