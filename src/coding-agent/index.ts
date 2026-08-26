import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import OpenAI from 'openai';

export interface AgentConfig {
  workspace: string;
  model?: string;
  maxIterations?: number;
  commandTimeoutMs?: number;
  maxOutputChars?: number;
  dryRun?: boolean;
  allowNetwork?: boolean;
}

export interface AgentAction {
  type: 'read' | 'write' | 'search' | 'run' | 'finish';
  path?: string;
  content?: string;
  query?: string;
  command?: string;
  reason?: string;
  summary?: string;
}

export interface AgentResult {
  status: 'completed' | 'failed' | 'dry-run';
  summary: string;
  iterations: number;
  actions: number;
  tests: number;
  failures: string[];
}

const DEFAULT_COMMAND_TIMEOUT = 120_000;
const DEFAULT_MAX_OUTPUT = 50_000;
const DEFAULT_ITERATIONS = 12;
const MAX_FILE_SIZE = 2_000_000;
const SECRET_PATTERNS = [
  /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["']?[^\s"']+/gi,
  /sk-[A-Za-z0-9_-]{20,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
];

function redact(text: string): string {
  return SECRET_PATTERNS.reduce((value, pattern) => value.replace(pattern, '[REDACTED]'), text);
}

function safeRelative(workspace: string, candidate: string): string {
  const resolvedWorkspace = path.resolve(workspace);
  const resolved = path.resolve(resolvedWorkspace, candidate);
  const relative = path.relative(resolvedWorkspace, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Path escapes workspace: ${candidate}`);
  return resolved;
}

function run(command: string, cwd: string, timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, shell: true, env: process.env });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (value: { code: number; stdout: string; stderr: string }) => { if (!settled) { settled = true; resolve(value); } };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish({ code: 124, stdout, stderr: `${stderr}\nCommand timed out after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', error => { clearTimeout(timer); if (!settled) { settled = true; reject(error); } });
    child.on('close', code => { clearTimeout(timer); finish({ code: code ?? 1, stdout, stderr }); });
  });
}

export class CodingAgent {
  private readonly config: Required<Pick<AgentConfig, 'maxIterations' | 'commandTimeoutMs' | 'maxOutputChars' | 'dryRun' | 'allowNetwork'>> & AgentConfig;
  private readonly client?: OpenAI;

  constructor(config: AgentConfig) {
    this.config = {
      maxIterations: DEFAULT_ITERATIONS,
      commandTimeoutMs: DEFAULT_COMMAND_TIMEOUT,
      maxOutputChars: DEFAULT_MAX_OUTPUT,
      dryRun: false,
      allowNetwork: false,
      ...config,
      workspace: path.resolve(config.workspace),
    };
    if (process.env.OPENAI_API_KEY) this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async inspect(relativePath: string): Promise<string> {
    const file = safeRelative(this.config.workspace, relativePath);
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error(`Not a file: ${relativePath}`);
    if (stat.size > MAX_FILE_SIZE) throw new Error(`File exceeds ${MAX_FILE_SIZE} bytes: ${relativePath}`);
    return fs.readFile(file, 'utf8');
  }

  async search(query: string): Promise<string[]> {
    const results: string[] = [];
    const ignored = new Set(['node_modules', '.git', 'dist', 'coverage', '.next']);
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (ignored.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else {
          try {
            const stat = await fs.stat(full);
            if (stat.size > MAX_FILE_SIZE) continue;
            const text = await fs.readFile(full, 'utf8');
            if (text.toLowerCase().includes(query.toLowerCase())) {
              results.push(path.relative(this.config.workspace, full));
              if (results.length >= 100) return;
            }
          } catch { /* binary/unreadable files are skipped */ }
        }
      }
    };
    await walk(this.config.workspace);
    return results;
  }

  async write(relativePath: string, content: string): Promise<void> {
    if (this.config.dryRun) return;
    const file = safeRelative(this.config.workspace, relativePath);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
  }

  async execute(command: string): Promise<{ code: number; stdout: string; stderr: string }> {
    if (!this.config.allowNetwork && /\b(curl|wget|Invoke-WebRequest|npm\s+(publish|login)|git\s+push)\b/i.test(command)) {
      throw new Error('Network/publishing command blocked. Set CODING_AGENT_ALLOW_NETWORK=true explicitly.');
    }
    return run(command, this.config.workspace, this.config.commandTimeoutMs);
  }

  private buildPrompt(task: string, context: string): string {
    return [
      'You are a senior software engineer operating a local coding workspace.',
      'Return exactly one JSON object per response with an action field.',
      'Allowed actions:',
      '{"action":"read","path":"relative/file"}',
      '{"action":"search","query":"text"}',
      '{"action":"write","path":"relative/file","content":"complete UTF-8 file content"}',
      '{"action":"run","command":"test command"}',
      '{"action":"finish","summary":"what was completed"}',
      'Never include credentials, API keys, tokens or passwords in output.',
      'Prefer small, reversible edits. Run relevant tests after changes.',
      `Workspace: ${this.config.workspace}`,
      `Task: ${task}`,
      `Recent context:\n${context}`,
    ].join('\n');
  }

  private parseAction(raw: string): AgentAction {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? raw;
    const parsed = JSON.parse(fenced.trim());
    if (!parsed || typeof parsed !== 'object' || typeof parsed.action !== 'string') throw new Error('Model returned an invalid action object');
    const allowed = new Set(['read', 'search', 'write', 'run', 'finish']);
    if (!allowed.has(parsed.action)) throw new Error(`Unsupported agent action: ${parsed.action}`);
    return { ...parsed, type: parsed.action } as AgentAction;
  }

  private async act(action: AgentAction): Promise<string> {
    switch (action.type) {
      case 'read':
        if (!action.path) throw new Error('read requires path');
        return redact(await this.inspect(action.path));
      case 'search':
        if (!action.query) throw new Error('search requires query');
        return JSON.stringify(await this.search(action.query));
      case 'write':
        if (!action.path || action.content === undefined) throw new Error('write requires path and content');
        await this.write(action.path, action.content);
        return this.config.dryRun ? 'DRY_RUN: write skipped' : `Wrote ${action.path}`;
      case 'run': {
        if (!action.command) throw new Error('run requires command');
        const result = await this.execute(action.command);
        return JSON.stringify({ code: result.code, stdout: redact(result.stdout).slice(0, this.config.maxOutputChars), stderr: redact(result.stderr).slice(0, this.config.maxOutputChars) });
      }
      case 'finish':
        return action.summary || 'Finished';
    }
  }

  async runTask(task: string): Promise<AgentResult> {
    if (!this.client) throw new Error('OPENAI_API_KEY is required for autonomous mode');
    const model = this.config.model || process.env.CODING_AGENT_MODEL;
    if (!model) throw new Error('CODING_AGENT_MODEL or --model is required; no model name is assumed.');
    let context = 'No actions taken yet.';
    let actions = 0;
    let tests = 0;
    const failures: string[] = [];

    for (let iteration = 1; iteration <= this.config.maxIterations; iteration++) {
      const response = await this.client.chat.completions.create({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: 'You are a precise coding agent. JSON only.' },
          { role: 'user', content: this.buildPrompt(task, context) },
        ],
      });
      const raw = response.choices[0]?.message?.content;
      if (!raw) throw new Error('Model returned an empty response');
      let action: AgentAction;
      try { action = this.parseAction(raw); }
      catch (error) {
        failures.push(`Iteration ${iteration}: invalid model action: ${error instanceof Error ? error.message : String(error)}`);
        context = failures[failures.length - 1];
        continue;
      }
      actions++;
      try {
        const output = await this.act(action);
        if (action.type === 'run') tests++;
        context = `${action.type}: ${output}`;
        if (action.type === 'finish') return { status: this.config.dryRun ? 'dry-run' : 'completed', summary: action.summary || output, iterations: iteration, actions, tests, failures };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`Iteration ${iteration}: ${message}`);
        context = `ACTION FAILED: ${message}`;
      }
    }

    return { status: 'failed', summary: 'Iteration budget exhausted before the agent produced a finish action.', iterations: this.config.maxIterations, actions, tests, failures };
  }
}

export { redact, safeRelative };
