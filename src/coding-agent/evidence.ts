import { createHash } from 'crypto';

export interface EvidenceEvent {
  at: string;
  action: string;
  ok: boolean;
  summary: string;
  digest: string;
}

export class EvidenceLedger {
  private readonly events: EvidenceEvent[] = [];

  append(action: string, ok: boolean, summary: string): EvidenceEvent {
    const payload = JSON.stringify({ at: new Date().toISOString(), action, ok, summary });
    const event: EvidenceEvent = {
      ...JSON.parse(payload),
      digest: createHash('sha256').update(payload).digest('hex'),
    };
    this.events.push(event);
    return event;
  }

  snapshot(): readonly EvidenceEvent[] {
    return [...this.events];
  }

  verify(): boolean {
    return this.events.every(event => {
      const payload = JSON.stringify({ at: event.at, action: event.action, ok: event.ok, summary: event.summary });
      return createHash('sha256').update(payload).digest('hex') === event.digest;
    });
  }
}
