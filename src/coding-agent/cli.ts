#!/usr/bin/env node

import path from 'path';
import { AgentConfig } from './index.js';
import { SultanOrchestrator } from './orchestrator.js';

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function hasFlag(name: string): boolean { return process.argv.includes(name); }

async function main(): Promise<void> {
  const workspace = path.resolve(getArg('--workspace') || process.cwd());
  const task = getArg('--task');
  if (!task) {
    console.error('Usage: n8n-coding-agent --task "describe the coding task" [--workspace ./repo] [--model MODEL] [--dry-run]');
    process.exit(2);
  }
  const config: AgentConfig = {
    workspace,
    model: getArg('--model') || process.env.CODING_AGENT_MODEL,
    maxIterations: Number(getArg('--max-iterations') || process.env.CODING_AGENT_MAX_ITERATIONS || 12),
    commandTimeoutMs: Number(getArg('--timeout-ms') || process.env.CODING_AGENT_TIMEOUT_MS || 120000),
    maxOutputChars: Number(getArg('--max-output') || process.env.CODING_AGENT_MAX_OUTPUT || 50000),
    dryRun: hasFlag('--dry-run'),
    allowNetwork: process.env.CODING_AGENT_ALLOW_NETWORK === 'true',
  };
  try {
    const result = await new SultanOrchestrator(config).run(task);
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.status === 'failed' ? 1 : 0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
void main();
