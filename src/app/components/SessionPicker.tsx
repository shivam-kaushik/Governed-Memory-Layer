"use client";
import { useRouter } from "next/navigation";

// Demo only: the server lists sessions when GML_DEMO=1. The cookie holds an opaque token, never a tenant or role.
export function SessionPicker({ sessions }: { sessions: { token: string; label: string }[] }) {
  const router = useRouter();
  if (!sessions.length) return <span>Sign-in via your identity provider.</span>;
  return (
    <label>
      Session:{" "}
      <select
        defaultValue=""
        onChange={(e) => {
          document.cookie = `session=${e.target.value}; path=/; SameSite=Strict`;
          router.refresh();
        }}
      >
        <option value="">(signed out)</option>
        {sessions.map((s) => <option key={s.token} value={s.token}>{s.label}</option>)}
      </select>
    </label>
  );
}
