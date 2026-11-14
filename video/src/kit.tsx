import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as loadSans } from "@remotion/google-fonts/Geist";
import { loadFont as loadMono } from "@remotion/google-fonts/GeistMono";

export const serif = loadSerif("normal", {
  weights: ["400"],
  subsets: ["latin"],
}).fontFamily;
loadSerif("italic", { weights: ["400"], subsets: ["latin"] });
export const sans = loadSans("normal", {
  weights: ["400", "600"],
  subsets: ["latin"],
}).fontFamily;
export const mono = loadMono("normal", {
  weights: ["400", "500"],
  subsets: ["latin"],
}).fontFamily;

export const C = {
  paper: "#f5f5f5",
  ink: "#2d3142",
  muted: "#4f5d75",
  soft: "#5a6580",
  accent: "#bf4520",
  accentTint: "rgba(191,69,32,0.08)",
  link: "#2e5aa8",
  rule: "rgba(45,49,66,0.16)",
};

export const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// Fade and rise into place at frame `at` of the current scene.
export const Reveal: React.FC<{
  at: number;
  dy?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ at, dy = 24, style, children }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        ...style,
        opacity: interpolate(frame, [at, at + 18], [0, 1], clamp),
        translate: `0px ${interpolate(frame, [at, at + 24], [dy, 0], { ...clamp, easing: ease })}px`,
      }}
    >
      {children}
    </div>
  );
};

// Common scene shell: paper background, eyebrow, page counter, fade in and out.
export const SceneFrame: React.FC<{
  eyebrow: string;
  page: string;
  children: React.ReactNode;
}> = ({ eyebrow, page, children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const opacity = interpolate(
    frame,
    [0, 12, durationInFrames - 12, durationInFrames],
    [0, 1, 1, 0],
    clamp,
  );
  return (
    <AbsoluteFill
      style={{ backgroundColor: C.paper, color: C.ink, fontFamily: sans }}
    >
      <AbsoluteFill style={{ opacity }}>
        <div
          style={{
            position: "absolute",
            left: 96,
            top: 52,
            fontFamily: mono,
            fontSize: 22,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: C.muted,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            position: "absolute",
            right: 96,
            top: 52,
            fontFamily: mono,
            fontSize: 22,
            letterSpacing: "0.12em",
            color: C.soft,
          }}
        >
          {page}
        </div>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Headline: React.FC<{
  at?: number;
  size?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ at = 0, size = 96, style, children }) => (
  <Reveal
    at={at}
    style={{
      fontFamily: serif,
      fontSize: size,
      lineHeight: 1.08,
      letterSpacing: "-0.02em",
      ...style,
    }}
  >
    {children}
  </Reveal>
);

export const Body: React.FC<{
  at: number;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ at, size = 40, color = C.muted, style, children }) => (
  <Reveal at={at} style={{ fontSize: size, lineHeight: 1.35, color, ...style }}>
    {children}
  </Reveal>
);

export type Kind =
  | "focal"
  | "backend"
  | "store"
  | "external"
  | "input"
  | "security";
const KIND: Record<Kind, { fill: string; stroke: string; dash?: boolean }> = {
  focal: { fill: C.accentTint, stroke: C.accent },
  backend: { fill: "#ffffff", stroke: C.ink },
  store: { fill: "rgba(45,49,66,0.06)", stroke: C.muted },
  external: { fill: "rgba(45,49,66,0.03)", stroke: "rgba(45,49,66,0.35)" },
  input: { fill: "rgba(79,93,117,0.12)", stroke: C.soft },
  security: {
    fill: "rgba(191,69,32,0.05)",
    stroke: "rgba(191,69,32,0.55)",
    dash: true,
  },
};

export const Box: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  sub?: string;
  kind?: Kind;
  at: number;
  active?: boolean;
  dim?: boolean;
  nameSize?: number;
  subSize?: number;
}> = ({
  x,
  y,
  w,
  h,
  name,
  sub,
  kind = "backend",
  at,
  active,
  dim,
  nameSize = 34,
  subSize = 22,
}) => {
  const frame = useCurrentFrame();
  const k = KIND[kind];
  const a = interpolate(frame, [at, at + 18], [0, 1], clamp);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w,
        height: h,
        boxSizing: "border-box",
        borderRadius: 14,
        background: k.fill,
        border: `${active ? 5 : 2}px ${k.dash && !active ? "dashed" : "solid"} ${active ? C.accent : k.stroke}`,
        opacity: a * (dim ? 0.4 : 1),
        translate: `0px ${interpolate(frame, [at, at + 24], [20, 0], { ...clamp, easing: ease })}px`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "0 12px",
      }}
    >
      <div style={{ fontSize: nameSize, fontWeight: 600, lineHeight: 1.15 }}>
        {name}
      </div>
      {sub ? (
        <div
          style={{
            fontFamily: mono,
            fontSize: subSize,
            color: C.muted,
            marginTop: 8,
            lineHeight: 1.25,
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
};

type Pt = [number, number];
const pathD = (pts: Pt[], r = 16) => {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [p0, p1, p2] = [pts[i - 1], pts[i], pts[i + 1]];
    const l1 = Math.abs(p1[0] - p0[0]) + Math.abs(p1[1] - p0[1]);
    const l2 = Math.abs(p2[0] - p1[0]) + Math.abs(p2[1] - p1[1]);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const u1 = [(p1[0] - p0[0]) / l1, (p1[1] - p0[1]) / l1];
    const u2 = [(p2[0] - p1[0]) / l2, (p2[1] - p1[1]) / l2];
    d += ` L${p1[0] - u1[0] * rr},${p1[1] - u1[1] * rr} Q${p1[0]},${p1[1]} ${p1[0] + u2[0] * rr},${p1[1] + u2[1] * rr}`;
  }
  return d + ` L${pts[pts.length - 1][0]},${pts[pts.length - 1][1]}`;
};

// Orthogonal arrow that draws itself, then shows its head.
export const Arrow: React.FC<{
  pts: Pt[];
  at: number;
  dur?: number;
  color?: string;
  dashed?: boolean;
}> = ({ pts, at, dur = 22, color = C.muted, dashed }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + dur], [0, 1], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
  const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const base = [b[0] - u[0] * 20, b[1] - u[1] * 20];
  const head = `${b[0]},${b[1]} ${base[0] - u[1] * 9},${base[1] + u[0] * 9} ${base[0] + u[1] * 9},${base[1] - u[0] * 9}`;
  return (
    <svg
      width={1920}
      height={1080}
      style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
    >
      {dashed ? (
        <path
          d={pathD(pts)}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray="10 8"
          opacity={p}
        />
      ) : (
        <path
          d={pathD(pts)}
          fill="none"
          stroke={color}
          strokeWidth={3}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - p}
        />
      )}
      <polygon
        points={head}
        fill={color}
        opacity={interpolate(p, [0.9, 1], [0, 1], clamp)}
      />
    </svg>
  );
};

export const Tag: React.FC<{
  x: number;
  y: number;
  at: number;
  color?: string;
  size?: number;
  children: React.ReactNode;
}> = ({ x, y, at, color = C.soft, size = 24, children }) => (
  <Reveal
    at={at}
    dy={8}
    style={{
      position: "absolute",
      left: x,
      top: y,
      fontFamily: mono,
      fontSize: size,
      color,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </Reveal>
);

// Shows the latest line whose start frame has passed.
export const Caption: React.FC<{
  lines: { at: number; text: React.ReactNode }[];
  y?: number;
  size?: number;
  w?: number;
}> = ({ lines, y = 900, size = 42, w }) => {
  const frame = useCurrentFrame();
  const cur = [...lines].reverse().find((l) => frame >= l.at);
  if (!cur) return null;
  return (
    <Reveal
      at={cur.at}
      dy={14}
      style={{
        position: "absolute",
        left: 96,
        ...(w ? { width: w } : { right: 96 }),
        top: y,
        fontSize: size,
        lineHeight: 1.3,
        color: C.ink,
      }}
    >
      {cur.text}
    </Reveal>
  );
};

// Big question card that hands over to a small header.
export const QuestionIntro: React.FC<{ n: number; text: string }> = ({
  n,
  text,
}) => {
  const frame = useCurrentFrame();
  const big = interpolate(frame, [0, 18, 92, 110], [0, 1, 1, 0], clamp);
  const small = interpolate(frame, [100, 125], [0, 1], clamp);
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          top: 300,
          opacity: big,
        }}
      >
        <div
          style={{
            fontFamily: mono,
            fontSize: 30,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: C.accent,
            marginBottom: 28,
          }}
        >
          Question {n}
        </div>
        <div
          style={{
            fontFamily: serif,
            fontSize: 96,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          {text}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 96,
          right: 96,
          top: 112,
          opacity: small,
          fontFamily: serif,
          fontSize: 50,
          lineHeight: 1.1,
          color: C.ink,
        }}
      >
        <span
          style={{
            fontFamily: mono,
            fontSize: 24,
            letterSpacing: "0.16em",
            color: C.accent,
            marginRight: 20,
          }}
        >
          Q{n}
        </span>
        {text}
      </div>
    </>
  );
};
