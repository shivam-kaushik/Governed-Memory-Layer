import type { MonitorAlert, MonitorMetrics, TraceEvent } from "../../contracts/contracts";
import { explainStep, groupRuns } from "../monitor-view";
import { kpisFromMetrics } from "../kpi-model";
import { KpiPanel } from "./KpiPanel";

// Pure render of runs, metrics and alerts. React escapes every string (G17).
export function MonitorView({ events, metrics, alerts, history = [] }: { events: TraceEvent[]; metrics: MonitorMetrics | null; alerts: MonitorAlert[]; history?: number[][] }) {
  const runs = groupRuns(events);
  return (
    <section>
      <KpiPanel kpis={kpisFromMetrics(metrics, history)} caption="Column height is the current value; floating points are the last samples, one per second." />
      {alerts.length > 0 && (
        <div role="alert" className="alert">
          <strong>{alerts.length} guard alert(s)</strong>
          <ul>
            {alerts.map((a, i) => (
              <li key={i}>
                {a.kind} · trace {a.traceId} · {a.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
      <h3 className="sect">Runs</h3>
      {runs.length === 0 && <p className="help">No runs yet. Ask the agent something in Chat and the run appears here.</p>}
      {runs.map((r) => (
        <details key={r.traceId} className="run" open={r === runs[0]}>
          <summary>
            {r.traceId} — {r.outcome ?? "running"}
          </summary>
          <ol className="run-steps">
            {r.events.map((e) => (
              <li key={e._id}>
                <code>{e.step}</code> {explainStep(e)}
              </li>
            ))}
          </ol>
        </details>
      ))}
    </section>
  );
}
