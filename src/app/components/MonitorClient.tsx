"use client";
import { useEffect, useRef, useState } from "react";
import type { MonitorAlert, MonitorMetrics, TraceEvent } from "../../contracts/contracts";
import { MonitorView } from "./MonitorView";

// Polls the monitor API once a second; a new run shows up within ~1s. Identity is the session cookie.
export function MonitorClient(init: { events: TraceEvent[]; metrics: MonitorMetrics | null; alerts: MonitorAlert[] }) {
  const [events, setEvents] = useState(init.events);
  const [metrics, setMetrics] = useState(init.metrics);
  const [alerts, setAlerts] = useState(init.alerts);
  const since = useRef(Math.max(0, ...init.events.map((e) => e.createdAtMs)));

  useEffect(() => {
    let live = true;
    const tick = async () => {
      try {
        const [ev, m, a] = await Promise.all(
          [`/api/monitor/events?since=${since.current}`, "/api/monitor/metrics", "/api/monitor/alerts"].map((u) => fetch(u).then((r) => (r.ok ? r.json() : null))),
        );
        if (!live) return;
        if (ev) {
          setEvents((old) => {
            const seen = new Set(old.map((e) => e._id));
            const fresh = (ev.events as TraceEvent[]).filter((e) => !seen.has(e._id));
            if (fresh.length) since.current = Math.max(since.current, ...fresh.map((e) => e.createdAtMs));
            return fresh.length ? [...old, ...fresh] : old;
          });
        }
        if (m) setMetrics(m.metrics);
        if (a) setAlerts(a.alerts);
      } catch {
        // network blip: keep showing the last data
      }
    };
    const t = setInterval(tick, 1000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  return <MonitorView events={events} metrics={metrics} alerts={alerts} />;
}
