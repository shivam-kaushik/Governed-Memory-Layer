import type { MonitorAlert, MonitorMetrics, TraceEvent } from "../../contracts/contracts";
import { explainStep, groupRuns } from "../monitor-view";

const pct = (n: number) => `${Math.round(n * 100)}%`;

// Pure render of runs, metrics and alerts. React escapes every string (G17).
export function MonitorView({ events, metrics, alerts }: { events: TraceEvent[]; metrics: MonitorMetrics | null; alerts: MonitorAlert[] }) {
  const runs = groupRuns(events);
  return (
    <section>
      {alerts.length > 0 && (
        <div role="alert" style={{ background: "#fdecea", border: "1px solid #b00020", padding: ".6rem", marginBottom: "1rem" }}>
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
      {metrics && (
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {[
            ["Recalls", String(metrics.recalls)],
            ["Denies", `${metrics.denies} (${pct(metrics.denyRate)})`],
            ["Abstain rate", pct(metrics.abstainRate)],
            ["Actions", Object.entries(metrics.actionsByType).map(([k, v]) => `${k}: ${v}`).join(", ") || "none"],
          ].map(([k, v]) => (
            <div key={k} style={{ border: "1px solid #ddd", padding: ".5rem .8rem", minWidth: 120 }}>
              <div style={{ fontSize: 12, color: "#666" }}>{k}</div>
              <div style={{ fontSize: 18 }}>{v}</div>
            </div>
          ))}
        </div>
      )}
      <h2>Runs</h2>
      {runs.length === 0 && <p>No runs yet. Run triage on the Live page.</p>}
      {runs.map((r) => (
        <details key={r.traceId} open={r === runs[0]}>
          <summary>
            {r.traceId} — {r.outcome ?? "running"}
          </summary>
          <ol>
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
