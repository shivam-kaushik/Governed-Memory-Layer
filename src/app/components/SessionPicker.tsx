"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { readSession, SESSION_EVENT } from "./session-cookie";

// Demo only: the server lists sessions when GML_DEMO=1. The cookie holds an opaque token, never a tenant or role.
export function SessionPicker({ sessions }: { sessions: { token: string; label: string }[] }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  useEffect(() => setToken(readSession()), []);
  if (!sessions.length) return <span>Sign in via your identity provider.</span>;
  return (
    <label>
      Session:{" "}
      <select
        suppressHydrationWarning // browser extensions inject attributes (e.g. data-sharkid) before React hydrates
        value={token}
        onChange={(e) => {
          document.cookie = `session=${e.target.value}; path=/; SameSite=Strict`;
          setToken(e.target.value);
          window.dispatchEvent(new Event(SESSION_EVENT));
          router.refresh();
        }}
      >
        <option value="">(signed out)</option>
        {sessions.map((s) => <option key={s.token} value={s.token}>{s.label}</option>)}
      </select>
    </label>
  );
}
