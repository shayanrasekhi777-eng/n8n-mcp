import { describe, expect, it } from 'vitest';
import { redact, safeRelative } from '../../src/coding-agent';

describe('coding agent safety primitives', () => {
  it('keeps relative paths inside the workspace', () => {
    const workspace = '/tmp/project';
    expect(safeRelative(workspace, 'src/index.ts')).toBe('/tmp/project/src/index.ts');
  });

  it('rejects path traversal', () => {
    expect(() => safeRelative('/tmp/project', '../secret.txt')).toThrow(/escapes workspace/);
  });

  it('redacts common credential patterns', () => {
    const value = 'api_key=super-secret-value sk-abcdefghijklmnopqrstuvwxyz123456';
    expect(redact(value)).not.toContain('super-secret-value');
    expect(redact(value)).toContain('[REDACTED]');
  });
});
