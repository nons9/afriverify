# @afriverify/mcp

AfriVerify MCP server — identity verification tools for AI agents.

Connect Claude, GPT, Gemini, and any MCP-compatible agent to AfriVerify's
identity, trust, and VIT verification APIs.

## Tools

| Tool | Description |
|------|-------------|
| `afriverify_verify_initiate` | Start a verification session for a phone number |
| `afriverify_verify_send_otp` | Send a 6-digit OTP via SMS or email |
| `afriverify_verify_confirm_otp` | Confirm the OTP the user entered |
| `afriverify_verify_status` | Poll a session for completion |
| `afriverify_vit_verify` | Validate a Verified Identity Token (VIT) — no PII returned |
| `afriverify_identity_check` | Check if a phone number has a verified AfriVerify identity |
| `afriverify_trust_score` | Get trust score and history for an identity |
| `afriverify_trust_update` | Post a trust event (transaction, fraud signal, etc.) |

## Quick start

### 1. Get an API key

Create an account at [afriverify.sankofaapp.com](https://afriverify.sankofaapp.com)
and generate an API key with `verify` and `check` permissions.

### 2. Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "afriverify": {
      "command": "npx",
      "args": ["@afriverify/mcp"],
      "env": {
        "AFRIVERIFY_API_KEY": "avk_live_your_key_here"
      }
    }
  }
}
```

Restart Claude Desktop. The AfriVerify tools appear automatically.

### 3. Configure Claude Code

```bash
claude mcp add afriverify npx @afriverify/mcp \
  --env AFRIVERIFY_API_KEY=avk_live_your_key_here
```

### Sandbox / testing

Use a test key (`avk_test_…`) and set the base URL to the sandbox:

```json
{
  "mcpServers": {
    "afriverify": {
      "command": "npx",
      "args": ["@afriverify/mcp"],
      "env": {
        "AFRIVERIFY_API_KEY": "avk_test_your_key_here",
        "AFRIVERIFY_BASE_URL": "https://api.afriverify.sankofaapp.com/sandbox/v1"
      }
    }
  }
}
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AFRIVERIFY_API_KEY` | Yes | Your AfriVerify API key |
| `AFRIVERIFY_BASE_URL` | No | Override API base URL (for sandbox or local dev) |
