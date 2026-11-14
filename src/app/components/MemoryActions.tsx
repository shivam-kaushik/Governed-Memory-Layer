"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function MemoryActions({ id }: { id: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const send = async (path: string, body: unknown) => {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) {
      setErr("");
      router.refresh();
    } else {
      const e = String(((await r.json()) as { error?: string }).error ?? r.status);
      setErr(e === "MANUAL_DISABLED" ? "Turn on Manual controls in the Live demo tab first." : e === "OP_DENIED" || e === "SCOPE_DENIED" ? "Your role is not allowed to do this." : e);
    }
  };
  return (
    <>
      <button onClick={() => { const text = window.prompt("Corrected text"); if (text) void send("/api/memories/correct", { id, text, reason: "dashboard correction" }); }}>Correct</button>
      <button onClick={() => { if (window.confirm("Forget this memory and everything derived from it?")) void send("/api/memories/forget", { id, reason: "dashboard forget" }); }}>Forget</button>
      {err && <small className="err"> {err}</small>}
    </>
  );
}
