[English](README.md) | Korean

**이 리포지토리는 Anthropic과 OpenAI의 공식 리포지토리가 아닌 서드파티 프로젝트입니다.**

# Claude for Cheap MCP

이 프로젝트는 Claude Code를 Pro 구독으로 사용할 때 사용량 제한에 너무 빨리 도달하는 것을 방지하기 위해 만들어졌습니다.

## 사용시 요구사항

- Claude Code (CLI)가 설치되어 있고 로그인되어 있어야 합니다 (Claude Pro/Max, API, Kimi, GLM 등)
- Codex CLI가 설치되어 있고 로그인되어 있어야 합니다 (ChatGPT Plus/Pro, API)
- - Codex CLI를 API로 사용할 때는 계정이 GPT-5.3-Codex를 호출할 수 있어야 합니다.

## 사용 방법

### 방법 A: 명령어 사용 (권장)

`claude mcp add --scope user claude-for-cheap -- npx -y claude-for-cheap`
위 명령어를 실행하여 Claude Code에 MCP 서버를 추가하세요.

### 방법 B: npx를 사용하여 수동 설치

별도 설치 없이 최신 버전을 자동으로 사용합니다.

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

### 방법 C: 로컬 클론을 이용하여 수동 설치

이 저장소를 클론하고 `npm install` 실행 후 로컬 `server.js` 경로를 지정하세요:

```json
{
  "mcpServers": {
    "claude-for-cheap": {
      "command": "node",
      "args": ["/절대경로/claude-for-cheap/server.js"]
    }
  }
}
```

## 작동하는 방법

Claude Code가 코드베이스 탐색이나 특정 기능이 있는 함수 찾기와 같이 많은 컨텍스트 창과 토큰을 소비하는 검색 작업을 수행할 때, 이러한 작업을 Codex CLI에 위임하여 토큰을 절약할 수 있습니다.