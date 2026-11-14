import type { EpisodeOutcome } from "../agent/episode";
import type { Alert, Clock } from "../contracts/contracts";
import type { Notifier, NotifyEvent } from "./notify";

export interface AutonomyDeps {
  baseAlert: Alert;
  clock: Clock;
  notifier: Notifier;
  isManual(): boolean;
  rotatePool(): void; // simulated drift: the world changes so learned fixes go stale
  runEpisode(alert: Alert): Promise<EpisodeOutcome>;
  tickAdvanceMs?: number;
  rotateEveryTicks?: number;
}

export interface AutonomyStatus {
  running: boolean;
  ticks: number;
  fixed: number;
  escalated: number;
  learned: number;
  reused: number;
  forgotten: number;
  blocked: number;
  rotations: number;
  errors: number;
  notifications: { kind: string; alertId: string; ok: boolean; detail: string }[];
}

// The agent runs by itself: each tick is a new incident handled end to end. Paused while manual controls are on.
export function createAutonomy(d: AutonomyDeps) {
  const s: AutonomyStatus = { running: false, ticks: 0, fixed: 0, escalated: 0, learned: 0, reused: 0, forgotten: 0, blocked: 0, rotations: 0, errors: 0, notifications: [] };
  let timer: ReturnType<typeof setInterval> | undefined;
  let busy = false;

  async function tickOnce(): Promise<void> {
    if (d.isManual() || busy) return;
    busy = true;
    s.ticks++;
    try {
      d.clock.advanceMs?.(d.tickAdvanceMs ?? 86_400_000);
      if (d.rotateEveryTicks && s.ticks % d.rotateEveryTicks === 0) {
        d.rotatePool();
        s.rotations++;
      }
      const alert = { ...d.baseAlert, id: `${d.baseAlert.id}-t${s.ticks}` };
      const e = await d.runEpisode(alert);
      const last = e.turns[e.turns.length - 1]!;
      if (e.fixed) s.fixed++;
      else s.escalated++;
      for (const t of e.turns) {
        if (t.learnedId) s.learned++;
        if (t.forgotten?.length) s.forgotten += t.forgotten.length;
        if (t.result.rejected) s.blocked++;
      }
      if (e.fixed && e.turns[0]?.action.usedMemoryIds.length && e.turns.length === 1) s.reused++;
      const blocked = e.turns.find((t) => t.result.rejected);
      const ev: NotifyEvent | null = blocked
        ? { kind: "BLOCKED", alertId: alert.id, traceId: blocked.traceId, detail: blocked.result.rejected! }
        : !e.fixed
          ? { kind: "ESCALATE", alertId: alert.id, traceId: last.traceId, detail: "NOT_FIXED" }
          : e.turns.some((t) => t.forgotten?.length)
            ? { kind: "FORGOT_STALE_MEMORY", alertId: alert.id, traceId: last.traceId, detail: "MEMORY_PROVED_WRONG" }
            : null;
      if (ev) {
        const r = await d.notifier.notify(ev).catch(() => ({ ok: false, detail: "SEND_FAILED" }));
        s.notifications = [{ kind: ev.kind, alertId: ev.alertId, ok: r.ok, detail: r.detail }, ...s.notifications].slice(0, 10);
      }
    } catch {
      s.errors++;
    } finally {
      busy = false;
    }
  }

  return {
    tickOnce,
    status: (): AutonomyStatus => ({ ...s, notifications: [...s.notifications] }),
    start(intervalMs: number) {
      if (timer) return;
      s.running = true;
      timer = setInterval(() => void tickOnce(), intervalMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      s.running = false;
    },
  };
}
