export type Mood = "idle" | "thinking" | "saved" | "updated" | "deleted";
export type Op = "saved" | "updated" | "deleted";

export const MOOD_EVENT = "gml:mood";
// How long a reaction stays before the mascot relaxes back to idle (UI-only timing).
export const MOOD_HOLD: Record<Mood, number> = { idle: 0, thinking: 0, saved: 3800, updated: 3800, deleted: 3800 };

export const moodForOp = (op?: Op): Mood => op ?? "idle";

type Stepish = { op?: Op };
// The first memory change anywhere in a reply (single answer or any attempt of an incident run).
export function replyOp(r: { steps?: Stepish[]; turns?: { steps?: Stepish[] }[] }): Op | undefined {
  const all = [...(r.steps ?? []), ...(r.turns ?? []).flatMap((t) => t.steps ?? [])];
  return all.find((s) => s.op)?.op;
}

export const emitMood = (mood: Mood) => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<Mood>(MOOD_EVENT, { detail: mood }));
};
