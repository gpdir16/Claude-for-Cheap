English | [Korean](README.ko.md)

**This is not a official repository of Anthropic and OpenAI. This is a third-party project.**

# Claude for Cheap MCP

This project was created to prevent the usage limit from being reached too quickly when using Claude Code with a Pro subscription.

## Prerequisites

- Claude Code (CLI) is installed and logged in (Claude Pro/Max, API, Kimi, GLM, etc.)
- Codex CLI is installed and logged in (ChatGPT Plus/Pro, API)
- - When using the API with Codex CLI, the account must be able to call GPT-5.3-Codex.

## How to Use

### Option A: Use the command (Recommended)

`claude mcp add --scope user claude-for-cheap -- npx -y claude-for-cheap`
Run the command above to add the MCP server to Claude Code.

### Option B: Manual installation using npx

This automatically uses the latest version without a separate installation.

```json
{
  "mcpServers": {
    "claude-for-cheap": {
      "command": "npx",
      "args": ["-y", "claude-for-cheap"]
    }
  }
}
```

### Option C: Manual installation using a local clone

Clone this repository, run `npm install`, then point to the local `server.js`:

```json
{
  "mcpServers": {
    "claude-for-cheap": {
      "command": "node",
      "args": ["/absolute/path/to/claude-for-cheap/server.js"]
    }
  }
}
```

## How it Works

When Claude Code performs search tasks that consume a lot of context window and tokens, such as exploring the codebase or finding functions with specific features, it can delegate these tasks to the Codex CLI to save tokens.