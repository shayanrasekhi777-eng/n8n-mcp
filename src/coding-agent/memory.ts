import { promises as fs } from 'fs';
import path from 'path';

export interface MemoryEntry {
  id: string;
  task: string;
  kind: 'decision' | 'failure' | 'success' | 'fact';
  content: string;
  createdAt: string;
}

export class ProjectMemory {
  private readonly file: string;
  private entries: MemoryEntry[] = [];

  constructor(workspace: string) {
    this.file = path.join(path.resolve(workspace), '.sultan', 'memory.json');
  }

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8')) as MemoryEntry[];
      if (Array.isArray(parsed)) this.entries = parsed.slice(-500);
    } catch {
      this.entries = [];
    }
  }

  async add(entry: Omit<MemoryEntry, 'createdAt'>): Promise<void> {
    this.entries.push({ ...entry, createdAt: new Date().toISOString() });
    this.entries = this.entries.slice(-500);
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(this.entries, null, 2), 'utf8');
  }

  recall(query: string, limit = 8): MemoryEntry[] {
    const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
    return this.entries
      .map(entry => ({ entry, score: terms.reduce((n, term) => n + (entry.content.toLowerCase().includes(term) || entry.task.toLowerCase().includes(term) ? 1 : 0), 0) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.entry);
  }
}
