import { promises as fs } from 'fs';
import path from 'path';

export interface RepositoryNode { file: string; extension: string; size: number; }
export interface RepositoryGraph { root: string; nodes: RepositoryNode[]; generatedAt: string; }

const ignored = new Set(['node_modules', '.git', 'dist', 'coverage', '.next', '.sultan']);

export async function buildRepositoryGraph(workspace: string, maxFiles = 5000): Promise<RepositoryGraph> {
  const root = path.resolve(workspace);
  const nodes: RepositoryNode[] = [];
  const walk = async (dir: string): Promise<void> => {
    if (nodes.length >= maxFiles) return;
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        try { const stat = await fs.stat(full); nodes.push({ file: path.relative(root, full), extension: path.extname(entry.name).toLowerCase(), size: stat.size }); }
        catch { /* transient/unreadable entries are skipped */ }
      }
      if (nodes.length >= maxFiles) return;
    }
  };
  await walk(root);
  return { root, nodes, generatedAt: new Date().toISOString() };
}
