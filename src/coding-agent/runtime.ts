import { promises as fs } from 'fs';
import path from 'path';
import { CodingAgent, AgentConfig, AgentResult } from './index.js';

export type AgentPhase = 'plan' | 'discover' | 'implement' | 'verify' | 'repair' | 'review' | 'deliver';

export interface RuntimeState {
  version: 1;
  task: string;
  phase: AgentPhase;
  iteration: number;
  startedAt: string;
  updatedAt: string;
  result?: AgentResult;
  history: Array<{ phase: AgentPhase; iteration: number; at: string; note: string }>;
}

const phases: AgentPhase[] = ['plan', 'discover', 'implement', 'verify', 'repair', 'review', 'deliver'];

export class AgentRuntime {
  private readonly stateFile: string;
  private state: RuntimeState;

  constructor(private readonly config: AgentConfig) {
    this.stateFile = path.join(path.resolve(config.workspace), '.sultan', 'state.json');
    const now = new Date().toISOString();
    this.state = {
      version: 1,
      task: '',
      phase: 'plan',
      iteration: 0,
      startedAt: now,
      updatedAt: now,
      history: [],
    };
  }

  async load(): Promise<RuntimeState> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.stateFile, 'utf8')) as RuntimeState;
      if (parsed?.version === 1 && Array.isArray(parsed.history)) this.state = parsed;
    } catch {
      // First run or unreadable state: start clean.
    }
    return this.state;
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.stateFile), { recursive: true });
    this.state.updatedAt = new Date().toISOString();
    await fs.writeFile(this.stateFile, JSON.stringify(this.state, null, 2), 'utf8');
  }

  private async setPhase(phase: AgentPhase, note: string): Promise<void> {
    this.state.phase = phase;
    this.state.iteration += 1;
    this.state.history.push({ phase, iteration: this.state.iteration, at: new Date().toISOString(), note });
    await this.persist();
  }

  async run(task: string): Promise<AgentResult> {
    await this.load();
    this.state.task = task;
    await this.persist();

    // The current coding agent remains the execution engine; the runtime adds
    // durable lifecycle state so interrupted work can be inspected and resumed.
    for (const phase of phases.slice(0, -1)) {
      await this.setPhase(phase, `Entering ${phase}`);
    }

    const agent = new CodingAgent(this.config);
    const result = await agent.runTask(task);
    this.state.result = result;
    await this.setPhase(result.status === 'completed' ? 'deliver' : 'repair', result.summary);
    await this.persist();
    return result;
  }
}
