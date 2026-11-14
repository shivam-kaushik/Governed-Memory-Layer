import type { MonitorAlert, MonitorMetrics, TraceEvent } from "../../contracts/contracts";
import { MonitorClient } from "../components/MonitorClient";
import { load } from "../page-data";

export default async function MonitorPage() {
  const ev = await load<{ events: TraceEvent[] }>("/api/monitor/events?since=0");
  if (ev.status === 401) return <p>Pick a session above to continue.</p>;
  const [m, a] = await Promise.all([load<{ metrics: MonitorMetrics }>("/api/monitor/metrics"), load<{ alerts: MonitorAlert[] }>("/api/monitor/alerts")]);
  return <MonitorClient events={ev.data?.events ?? []} metrics={m.data?.metrics ?? null} alerts={a.data?.alerts ?? []} />;
}
