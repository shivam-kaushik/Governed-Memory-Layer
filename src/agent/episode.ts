import type { Alert, Caller, Clock, MemoryLayer, TraceStore } from "../contracts/contracts";
import type { AgentBrain } from "./brain-rules";
import { runTriage, type TriageContext, type TriageOutcome } from "./triage-agent";

export interface EpisodeOutcome {
  turns: TriageOutcome[];
  fixed: boolean;
}

// One incident, up to maxTurns triage turns. Each turn is a full governed runTriage (own trace).
// The agent keeps going only while investigating yields new findings; a verified fix is remembered by runTriage.
export async function runEpisode(
  alert: Alert,
  caller: Caller,
  layer: MemoryLayer,
  brain: AgentBrain,
  trace: TraceStore,
  clock: Clock,
  ctx: TriageContext,
  maxTurns = 3,
): Promise<EpisodeOutcome> {
  const turns: TriageOutcome[] = [];
  const notes = [...(ctx.notes ?? [])];
  for (let i = 0; i < maxTurns; i++) {
    const o = await runTriage(alert, caller, layer, brain, trace, clock, { ...ctx, notes: [...notes] });
    turns.push(o);
    const f = o.result.findings;
    if (o.result.fixed || o.action.tool !== "investigate" || !f || notes.includes(f)) break;
    notes.push(f);
  }
  return { turns, fixed: turns.at(-1)?.result.fixed === true };
}
