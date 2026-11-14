import { LivePanel } from "./components/LivePanel";
import { load } from "./page-data";
import { getServer } from "./server";

export default async function LivePage() {
  const { status, data } = await load<{ alerts: ({ id: string } & Record<string, unknown>)[] }>("/api/live/alerts");
  if (status === 401) return <p>Pick a session above to continue.</p>;
  const alert = data?.alerts[0];
  return alert ? <LivePanel alert={alert} demo={(await getServer()).demoMode} /> : <p>No alerts.</p>;
}
