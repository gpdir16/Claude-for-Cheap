English | [Korean](README.ko.md)

**This is not a official repository of Anthropic and OpenAI. This is a third-party project.**

# Claude for Cheap MCP

This project was created to prevent the usage limit from being reached too quickly when using Claude Code with a Pro subscription.

## Prerequisites

- Claude Code (CLI) is installed and logged in (Claude Pro/Max, API, Kimi, GLM, etc.)
- Codex CLI is installed and logged in (ChatGPT Plus/Pro, API)
- - When using the API with Codex CLI, the account must be able to call GPT-5.3-Codex.

## How to Use

Add the following to `~/.claude/settings.json`, or to `.mcp.json` in the project root if you want to use it only for a specific project.

### Option A: via npx (recommended)

No installation required. Uses the latest published version automatically.

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

### Option B: local clone

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