export type RiskLevel = 'safe' | 'review' | 'blocked';
export interface PolicyDecision { risk: RiskLevel; reason: string; }
const blocked = [/rm\s+-rf\s+\//i, /mkfs\b/i, /:\(\)\s*\{.*\|.*&.*\}/i, /git\s+push\s+--force/i];
const review = [/git\s+push/i, /npm\s+publish/i, /pnpm\s+publish/i, /docker\s+push/i, /terraform\s+(apply|destroy)/i];
export function assessCommand(command: string): PolicyDecision {
  if (blocked.some(pattern => pattern.test(command))) return { risk: 'blocked', reason: 'Destructive or forceful command detected.' };
  if (review.some(pattern => pattern.test(command))) return { risk: 'review', reason: 'External state or publishing operation requires explicit review.' };
  return { risk: 'safe', reason: 'No high-risk pattern detected by the local policy.' };
}
