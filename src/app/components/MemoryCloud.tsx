// Translucent 3D cloud shown in chat when the agent changes memory. Pure CSS 3D, no deps. Colors live in layout.tsx (.mc-*).
export type MemoryOp = "saved" | "updated" | "deleted";

const COPY: Record<MemoryOp, { head: string; sub: string }> = {
  saved: { head: "Saved to memory", sub: "kept for future conversations" },
  updated: { head: "Memory updated", sub: "an existing claim was revised" },
  deleted: { head: "Memory forgotten", sub: "no longer recallable" },
};

// x, y, z in px, size in px: puffs arranged so the cluster reads as a cloud from any rotation angle.
const PUFFS: [number, number, number, number][] = [
  [0, 4, 0, 64], [-34, 14, 18, 48], [34, 12, -14, 52], [-14, -14, -26, 44], [18, -16, 26, 42], [-48, 22, -20, 34], [50, 24, 22, 32],
];

export function MemoryCloud({ op }: { op: MemoryOp }) {
  const c = COPY[op];
  return (
    <div className={`mc mc-${op}`} role="status">
      <div className="mc-stage" aria-hidden>
        <div className="mc-spin">
          {PUFFS.map(([x, y, z, s], i) => (
            <i key={i} className="mc-puff" style={{ "--x": `${x}px`, "--y": `${y}px`, "--z": `${z}px`, "--s": `${s}px`, "--i": i } as React.CSSProperties} />
          ))}
          <b className="mc-ring" />
          {[0, 1, 2, 3, 4].map((i) => <u key={i} className="mc-mote" style={{ "--i": i } as React.CSSProperties} />)}
        </div>
      </div>
      <div className="mc-copy">
        <strong>{c.head}</strong>
        <span>{c.sub}</span>
      </div>
    </div>
  );
}
