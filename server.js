#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const server = new McpServer({
    name: "claude-for-cheap",
    version: "0.1.0",
});

// ISO 타임스탬프를 파일명 안전 형식으로 반환: YYYYMMDD-HHmmss
function timestamp() {
    return new Date()
        .toISOString()
        .replace(/[-:T]/g, "")
        .slice(0, 15)
        .replace(/(\d{8})(\d{6})/, "$1-$2");
}

// Codex CLI를 읽기 전용으로 실행하고 최종 응답을 반환
function runCodex(toolName, prompt, cwd) {
    const tmpDir = mkdtempSync(join(tmpdir(), `cfc-${toolName}-${timestamp()}-`));
    const outFile = join(tmpDir, "last-message.txt");

    try {
        const args = [
            "exec",
            "--sandbox",
            "read-only",
            "--ephemeral",
            "--output-last-message",
            outFile,
            "--skip-git-repo-check",
            "-c",
            'model="gpt-5.3-codex"',
            "-c",
            'model_reasoning_effort="high"',
            prompt,
        ];

        const result = spawnSync("codex", args, {
            cwd: cwd ?? process.cwd(),
            encoding: "utf8",
            timeout: 10 * 60 * 1000,
            env: { ...process.env },
        });

        if (result.error) {
            return { ok: false, text: `Error: ${result.error.message}` };
        }

        let answer = "";
        try {
            answer = readFileSync(outFile, "utf8").trim();
        } catch {
            answer = result.stdout?.trim() ?? "";
        }

        if (!answer) {
            const stderr = result.stderr?.trim();
            return {
                ok: false,
                text: stderr ? `Error: ${stderr}` : "Error: No output from Codex CLI",
            };
        }

        return { ok: true, text: answer };
    } finally {
        try {
            rmSync(tmpDir, { recursive: true, force: true });
        } catch {
            /* ignore */
        }
    }
}

// runCodex 결과를 MCP content 응답으로 변환
function toMcpResponse({ ok, text }) {
    return {
        content: [{ type: "text", text }],
        ...(ok ? {} : { isError: true }),
    };
}

// Tool 1: summarize_codebase
server.registerTool(
    "summarize_codebase",
    {
        description:
            "Explore the entire project and return a structured summary: directory layout, key modules, entry points, and architectural overview. Use this to quickly orient yourself in an unfamiliar codebase. " +
            "IMPORTANT: Always use this tool FIRST before using Glob, Grep, Read, or the Explore agent when starting to understand a new codebase or project structure.",
        inputSchema: {
            cwd: z.string().optional().describe("Absolute path of the project root (default: Claude Code's working directory)"),
        },
    },
    async ({ cwd }) => {
        const prompt =
            "Explore this entire codebase and produce a structured summary. " +
            "Include: (1) directory tree with brief purpose of each folder, " +
            "(2) key entry points and main modules, " +
            "(3) primary technologies / frameworks detected, " +
            "(4) high-level architectural overview in 3-5 sentences. " +
            "Be concise but complete. Do NOT modify any files.";

        return toMcpResponse(runCodex("summary", prompt, cwd));
    },
);

// Tool 2: find_code
server.registerTool(
    "find_code",
    {
        description:
            "Search the codebase for files and functions responsible for a specific role or feature. " +
            "Returns file paths, line numbers, and brief explanations. " +
            "IMPORTANT: Always prefer this tool over Glob, Grep, or the Explore agent when you need to locate where something is implemented in the codebase.",
        inputSchema: {
            role: z
                .string()
                .describe(
                    "The feature, responsibility, or behavior to locate (e.g. 'user authentication', 'database connection', 'error handling middleware')",
                ),
            cwd: z.string().optional().describe("Absolute path of the project root (default: Claude Code's working directory)"),
        },
    },
    async ({ role, cwd }) => {
        const prompt =
            `Find all code in this codebase that is responsible for: "${role}". ` +
            "For each relevant location provide: file path (relative to project root), " +
            "line number range, function or class name, and a one-sentence explanation of its role. " +
            "Format each result as: [file:line] FunctionName — explanation. " +
            "Do NOT modify any files.";

        return toMcpResponse(runCodex("find", prompt, cwd));
    },
);

// Tool 3: ask_codex
server.registerTool(
    "ask_codex",
    {
        description:
            "Ask any general read-only question about the codebase. " +
            "IMPORTANT: Prefer this tool over manually reading files with Read, Grep, or the Explore agent for open-ended codebase questions — " +
            "e.g. 'How does X work?', 'What does this function return?', 'Are there any TODO comments?'",
        inputSchema: {
            question: z.string().describe("The question or research task to answer using the codebase"),
            cwd: z.string().optional().describe("Absolute path of the project root (default: Claude Code's working directory)"),
        },
    },
    async ({ question, cwd }) => {
        const prompt =
            `Answer the following question by reading the codebase. ` +
            `Question: ${question} ` +
            "Support your answer with specific file paths and line references where relevant. " +
            "Do NOT modify any files.";

        return toMcpResponse(runCodex("ask", prompt, cwd));
    },
);

// Tool 4: find_dead_code
server.registerTool(
    "find_dead_code",
    {
        description:
            "Scan the codebase for dead code: unused exports, unreferenced functions, unreachable code, unused variables, and dead imports. " +
            "Returns findings with exact file:line locations, confidence levels, and reasoning. " +
            "High-confidence only — avoids false positives from dynamic imports or eval.",
        inputSchema: {
            cwd: z.string().optional().describe("Absolute path of the project root (default: Claude Code's working directory)"),
        },
    },
    async ({ cwd }) => {
        const prompt =
            "Analyze this codebase and identify dead code with high confidence only. For each finding, provide:\n" +
            "1. [file:line] exact location\n" +
            "2. Type: 'unused export', 'unreferenced function', 'unreachable code', 'unused variable', or 'dead import'\n" +
            "3. Name of the function/variable/class\n" +
            "4. Confidence level: 'Certain' (no dynamic references found) or 'Likely' (static analysis suggests unused)\n" +
            "5. Reasoning: explain why it's considered dead, checking for dynamic imports, eval usage, or string-based property access that might hide usage\n\n" +
            "Important constraints:\n" +
            "- Ignore test files and mock implementations unless explicitly asked\n" +
            "- Consider barrel exports (index.ts/index.js) - re-exports are not dead code\n" +
            "- Flag any dynamic requires or computed property names that might reference this code\n" +
            "- Do NOT suggest file modifications\n\n" +
            "Format: [file:line] Type | Name | Confidence | Reasoning";

        return toMcpResponse(runCodex("dead-code", prompt, cwd));
    },
);

// Tool 5: analyze_dependencies
server.registerTool(
    "analyze_dependencies",
    {
        description:
            "Compare declared dependencies (package.json, requirements.txt, Cargo.toml) against actual imports in the codebase. " +
            "Detects unused packages, missing direct dependencies, version issues, and duplicate-purpose libraries. " +
            "Analysis is local-only — no network requests to registries.",
        inputSchema: {
            cwd: z.string().optional().describe("Absolute path of the project root (default: Claude Code's working directory)"),
        },
    },
    async ({ cwd }) => {
        const prompt =
            "Analyze the dependency management in this codebase. Focus on:\n" +
            "1. Listed dependencies vs actual imports: find packages declared in package.json/requirements.txt/Cargo.toml but never imported\n" +
            "2. Direct imports vs transitive dependencies: flag cases where code imports a package that should be listed as direct dependency\n" +
            "3. Version analysis: check lock files (package-lock.json, yarn.lock, poetry.lock, Cargo.lock) for outdated major versions or known deprecated packages\n" +
            "4. Duplicate functionality detection: identify if multiple libraries serve the same purpose (e.g., lodash + underscore, axios + fetch)\n\n" +
            "For each issue provide:\n" +
            "- Package name and current version\n" +
            "- Issue type: 'unused', 'missing-direct', 'outdated', 'deprecated', or 'duplicate'\n" +
            "- Location: which dependency file lists it\n" +
            "- Evidence: specific import statements or usage patterns found (or lack thereof)\n" +
            "- Recommendation: specific action with rationale\n\n" +
            "Important:\n" +
            "- Only analyze files present locally; do not attempt network requests to check latest versions\n" +
            "- Do NOT modify any files\n" +
            "- If no lock file exists, note that version analysis is limited\n\n" +
            "Format: Package | Version | Issue | Evidence | Recommendation";

        return toMcpResponse(runCodex("deps", prompt, cwd));
    },
);

// Tool 6: security_audit
server.registerTool(
    "security_audit",
    {
        description:
            "Perform a comprehensive OWASP-based security audit of the codebase. " +
            "Detects hardcoded secrets, injection vulnerabilities, path traversal, insecure cryptography, XSS, and auth/authorization issues. " +
            "Each finding includes severity, vulnerable code snippet, impact, and a fix suggestion.",
        inputSchema: {
            cwd: z.string().optional().describe("Absolute path of the project root (default: Claude Code's working directory)"),
        },
    },
    async ({ cwd }) => {
        const prompt =
            "Perform a comprehensive security audit on this codebase. Search for the following vulnerability patterns:\n\n" +
            "1. Hardcoded Secrets:\n" +
            "   - API keys, access tokens, private keys, passwords in source code\n" +
            "   - Database connection strings with credentials\n" +
            '   - Pattern: const API_KEY = "...", password = "..."\n\n' +
            "2. Injection Vulnerabilities:\n" +
            "   - SQL/NoSQL injection: string concatenation in queries without parameterization\n" +
            "   - Command injection: exec, system, spawn with user input\n" +
            "   - Code injection: eval, new Function, setTimeout with string\n\n" +
            "3. Path Traversal:\n" +
            "   - Unvalidated file path concatenation\n" +
            "   - User input used directly in fs.readFile, require(), import()\n\n" +
            "4. Insecure Cryptography:\n" +
            "   - Weak algorithms: MD5, SHA1 for sensitive data\n" +
            "   - Hardcoded IVs or keys in crypto operations\n" +
            "   - Randomness issues: Math.random() for security purposes\n\n" +
            "5. XSS Vulnerabilities:\n" +
            "   - innerHTML, dangerouslySetInnerHTML without sanitization\n" +
            "   - User input rendered without escaping\n\n" +
            "6. Authentication/Authorization Issues:\n" +
            "   - Hardcoded JWT secrets\n" +
            "   - Missing auth checks on sensitive routes\n" +
            "   - CORS misconfigurations allowing wildcard origins\n\n" +
            "For each finding:\n" +
            "- [file:line-start:line-end] exact location\n" +
            "- Severity: Critical (exploitable, data exposure) / High (likely exploitable) / Medium (potential risk) / Low (defense in depth)\n" +
            "- Category: one of the 6 categories above\n" +
            "- Vulnerable code snippet (max 3 lines)\n" +
            "- Impact: what could happen if exploited\n" +
            "- Fix suggestion: specific remediation\n\n" +
            "Constraints:\n" +
            "- Be precise with line numbers; verify the context is actually vulnerable, not just contains a keyword\n" +
            "- Do NOT report test data or intentionally vulnerable code marked with comments like // intentionally insecure for testing\n" +
            "- Do NOT modify any files";

        return toMcpResponse(runCodex("security", prompt, cwd));
    },
);

// HTML 태그 제거 및 기본 엔티티 디코딩
function stripTags(html) {
    return html
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")
        .replace(/&#x2F;/g, "/")
        .replace(/\s+/g, " ")
        .trim();
}

// DuckDuckGo HTML 버전에서 검색 결과를 가져옴 (외부 의존성 없음)
async function searchDuckDuckGo(query, maxResults = 10) {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    let html;
    try {
        const resp = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        });
        if (resp.status === 202) {
            return { ok: false, error: "DuckDuckGo rate limit (202). Try again in a few seconds." };
        }
        if (!resp.ok) {
            return { ok: false, error: `DuckDuckGo returned HTTP ${resp.status}` };
        }
        html = await resp.text();
    } catch (err) {
        return { ok: false, error: `Fetch failed: ${err.message}` };
    }

    // 각 클래스별로 순서대로 추출 (class 속성이 여러 형태로 올 수 있어 느슨하게 매칭)
    const extract = (pattern) => {
        const re = new RegExp(pattern, "g");
        const items = [];
        let m;
        while ((m = re.exec(html)) !== null) {
            items.push(stripTags(m[1]));
        }
        return items;
    };

    const titles = extract(`class="result__a"[^>]*>([\\s\\S]*?)<\\/a>`);
    const urls = extract(`class="result__url"[^>]*>([\\s\\S]*?)<\\/(?:a|span)>`);
    const snippets = extract(`class="result__snippet"[^>]*>([\\s\\S]*?)<\\/a>`);

    const count = Math.min(maxResults, titles.length);
    if (count === 0) {
        return { ok: false, error: "No results parsed from DuckDuckGo HTML (structure may have changed)" };
    }

    const results = [];
    for (let i = 0; i < count; i++) {
        results.push({
            index: i + 1,
            title: titles[i] ?? "",
            url: urls[i] ?? "",
            snippet: snippets[i] ?? "",
        });
    }
    return { ok: true, results };
}

// Tool 7: verify_fact
server.registerTool(
    "verify_fact",
    {
        description:
            "Verify a factual claim from the codebase by searching the web (DuckDuckGo) and having Codex analyze the results. " +
            "Returns a classification: Verified / Likely True / Contradicted / Uncertain — with confidence level and source references. " +
            "Use this to check if a library version, API behavior, or technical claim in the code is still accurate.",
        inputSchema: {
            query: z.string().describe("The claim or question to verify (e.g. 'Does express 4.x support async error handlers?')"),
            context: z.string().optional().describe("Relevant code snippet or file location where the claim appears"),
            requiredSources: z
                .number()
                .optional()
                .default(3)
                .describe("Minimum number of independent sources needed for 'Verified' classification (default: 3)"),
            cwd: z.string().optional().describe("Absolute path of the project root (default: Claude Code's working directory)"),
        },
    },
    async ({ query, context, requiredSources = 3, cwd }) => {
        const search = await searchDuckDuckGo(query, 10);
        if (!search.ok) {
            return toMcpResponse({ ok: false, text: `Web search failed: ${search.error}` });
        }

        const formattedResults = search.results.map((r) => `${r.index}. ${r.title} — ${r.url}\n   ${r.snippet}`).join("\n");

        const prompt =
            "You are given web search results to verify a factual claim. Analyze the results and determine accuracy.\n\n" +
            `Search Query: ${query}\n` +
            (context ? `Codebase Context:\n${context}\n\n` : "\n") +
            `Search Results (Top ${search.results.length}):\n${formattedResults}\n\n` +
            "Your task:\n" +
            "1. Cross-reference the claim with search results\n" +
            `2. Count how many independent sources confirm or contradict the claim (need ${requiredSources} for 'Verified')\n` +
            "3. Assess source reliability (official docs > reputable tech blogs > forums)\n\n" +
            "Classification:\n" +
            `- 'Verified': ${requiredSources}+ independent reliable sources confirm\n` +
            "- 'Likely True': 1-2 sources confirm, no contradictions\n" +
            "- 'Contradicted': Any reliable source explicitly contradicts\n" +
            "- 'Uncertain': Insufficient or conflicting information\n\n" +
            "Output format:\n" +
            "Classification: [Verified/Likely True/Contradicted/Uncertain]\n" +
            "Confidence: [High/Medium/Low]\n" +
            "Sources: [list confirming sources with brief credibility note]\n" +
            "Contradictions: [if any]\n" +
            "Summary: [2-3 sentence explanation]\n\n" +
            "Important:\n" +
            "- Do not make assumptions beyond the provided search results\n" +
            "- Flag if search results are too old (published >2 years ago for rapidly changing tech)\n" +
            "- Do NOT modify any files";

        return toMcpResponse(runCodex("verify", prompt, cwd));
    },
);

// 서버 시작
const transport = new StdioServerTransport();
await server.connect(transport);
