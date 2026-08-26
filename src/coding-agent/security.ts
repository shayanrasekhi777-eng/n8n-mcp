import path from 'path';

export interface SecurityPolicy {
  allowNetwork: boolean;
  allowPublishing: boolean;
  allowedCommands: RegExp[];
  blockedCommands: RegExp[];
}

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  allowNetwork: false,
  allowPublishing: false,
  allowedCommands: [],
  blockedCommands: [
    /\b(?:git\s+push|npm\s+(?:publish|login)|pnpm\s+(?:publish|login)|yarn\s+publish)\b/i,
    /\b(?:curl|wget|Invoke-WebRequest)\b/i,
  ],
};

export function assertWorkspace(workspace: string): string {
  return path.resolve(workspace);
}

export function validateCommand(command: string, policy: SecurityPolicy = DEFAULT_SECURITY_POLICY): void {
  if (!command.trim()) throw new Error('Command cannot be empty');
  if (policy.allowedCommands.length > 0 && !policy.allowedCommands.some(pattern => pattern.test(command))) {
    throw new Error('Command is not allowed by the coding-agent command policy.');
  }
  if (!policy.allowNetwork && policy.blockedCommands.some(pattern => pattern.test(command))) {
    throw new Error('Command blocked by the default no-network/no-publish policy.');
  }
  if (!policy.allowPublishing && /\b(?:git\s+push|npm\s+(?:publish|login)|pnpm\s+(?:publish|login)|yarn\s+publish)\b/i.test(command)) {
    throw new Error('Publishing command blocked. Explicit publishing permission is required.');
  }
}
