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
    } else setErr(String(((await r.json()) as { error?: string }).error ?? r.status));
  };
  return (
    <>
      <button onClick={() => { const text = window.prompt("Corrected text"); if (text) void send("/api/memories/correct", { id, text, reason: "dashboard correction" }); }}>Correct</button>
      <button onClick={() => { if (window.confirm("Forget this memory and everything derived from it?")) void send("/api/memories/forget", { id, reason: "dashboard forget" }); }}>Forget</button>
      {err && <small className="err"> {err}</small>}
    </>
  );
}
