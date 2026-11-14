import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Audio, Video } from "@remotion/media";
import {
  Body,
  C,
  Headline,
  Reveal,
  SceneFrame,
  Tag,
  mono,
  sans,
  serif,
} from "./kit";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const abs = (x: number, y: number, w?: number): React.CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  width: w,
});

// Frames per scene at 30 fps: narration length plus a short lead and tail.
export const DEMO_SCENES = [172, 284, 289, 292, 311, 348, 120];
export const DEMO_FRAMES = DEMO_SCENES.reduce((a, b) => a + b, 0);

const VO: React.FC<{ n: number }> = ({ n }) => (
  <Sequence from={6} layout="none">
    <Audio src={staticFile(`vo/s${n}.wav`)} />
  </Sequence>
);

// The app, shown in a window on the left of the frame.
const Screen: React.FC<{ at?: number; children: React.ReactNode }> = ({
  at = 0,
  children,
}) => (
  <Reveal
    at={at}
    dy={16}
    style={{
      ...abs(96, 150, 1200),
      height: 675,
      borderRadius: 14,
      overflow: "hidden",
      border: `2px solid ${C.rule}`,
      background: "#fff",
    }}
  >
    {children}
  </Reveal>
);

const Points: React.FC<{
  title: string;
  items: { at: number; text: string }[];
  x?: number;
  w?: number;
  y?: number;
}> = ({ title, items, x = 1340, w = 484, y = 150 }) => (
  <>
    <Reveal
      at={8}
      style={{
        ...abs(x, y, w),
        fontFamily: mono,
        fontSize: 24,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: C.accent,
      }}
    >
      {title}
    </Reveal>
    {items.map((it, i) => (
      <Reveal
        key={it.text}
        at={it.at}
        style={{
          ...abs(x, y + 60 + i * 124, w),
          fontSize: 30,
          lineHeight: 1.25,
          color: C.ink,
          paddingLeft: 44,
        }}
      >
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 4,
            fontFamily: mono,
            fontSize: 24,
            color: C.accent,
          }}
        >
          {i + 1}
        </span>
        {it.text}
      </Reveal>
    ))}
  </>
);

const TechLine: React.FC<{ at: number; text: string }> = ({ at, text }) => (
  <Reveal
    at={at}
    style={{
      ...abs(96, 880, 1728),
      fontFamily: mono,
      fontSize: 26,
      color: C.muted,
    }}
  >
    <span style={{ color: C.accent, marginRight: 14 }}>TECH</span>
    {text}
  </Reveal>
);

// ---------------------------------------------------------------- 1. Title
export const DemoTitle: React.FC = () => (
  <SceneFrame eyebrow="App demo · 1 minute" page="1 / 7">
    <VO n={1} />
    <Headline at={6} size={160} style={abs(96, 280, 1728)}>
      Governed Memory Layer
    </Headline>
    <Body at={30} size={50} style={abs(96, 520, 1500)}>
      An AI agent that remembers, while people stay in control.
    </Body>
    {[
      "1  No leaks between clients",
      "2  Fix wrong or old memory",
      "3  Prove memory changed behavior",
    ].map((t, i) => (
      <Reveal
        key={t}
        at={70 + i * 14}
        dy={12}
        style={{
          ...abs(96 + i * 590, 760),
          width: 560,
          padding: "18px 24px",
          border: `2px solid ${C.rule}`,
          borderRadius: 12,
          fontFamily: mono,
          fontSize: 26,
          color: C.muted,
          background: "#fff",
          boxSizing: "border-box",
        }}
      >
        {t}
      </Reveal>
    ))}
  </SceneFrame>
);

// ---------------------------------------------------------------- 2. Tech stack
const STACK: { name: string; role: string; qs: string[]; at: number }[] = [
  {
    name: "Next.js + TypeScript",
    role: "The app and API. Who you are is decided on the server, from your session.",
    qs: ["Q1"],
    at: 36,
  },
  {
    name: "MongoDB Atlas",
    role: "Vector search for memory. Every query is limited to your tenant, scope and expiry.",
    qs: ["Q1", "Q2"],
    at: 100,
  },
  {
    name: "Local embeddings",
    role: "Memory text is turned into vectors on the machine. It never leaves.",
    qs: ["Q1"],
    at: 156,
  },
  {
    name: "Voyage rerank",
    role: "Re-orders results that already passed the checks. It cannot add one.",
    qs: ["Q1"],
    at: 184,
  },
  {
    name: "Claude",
    role: "The agent's brain. It proposes; code decides what is allowed.",
    qs: ["Q3"],
    at: 218,
  },
  {
    name: "Zod + Vitest",
    role: "Strips forged fields from input, and tests every guardrail and the proof.",
    qs: ["Q1", "Q3"],
    at: 244,
  },
];
export const DemoStack: React.FC = () => (
  <SceneFrame eyebrow="Tech stack" page="2 / 7">
    <VO n={2} />
    <Headline at={4} size={72} style={abs(96, 110, 1728)}>
      What it is built with
    </Headline>
    {STACK.map((s, i) => (
      <Reveal
        key={s.name}
        at={s.at}
        style={{
          ...abs(96 + (i % 3) * 590, 250 + Math.floor(i / 3) * 290, 548),
          height: 262,
          boxSizing: "border-box",
          padding: "24px 28px",
          background: "#fff",
          border: `2px solid ${C.ink}`,
          borderRadius: 14,
        }}
      >
        <div style={{ fontSize: 38, fontWeight: 600 }}>{s.name}</div>
        <div
          style={{
            fontSize: 26,
            lineHeight: 1.3,
            color: C.muted,
            marginTop: 10,
          }}
        >
          {s.role}
        </div>
        <div
          style={{
            position: "absolute",
            left: 28,
            bottom: 20,
            display: "flex",
            gap: 10,
          }}
        >
          {s.qs.map((q) => (
            <span
              key={q}
              style={{
                fontFamily: mono,
                fontSize: 22,
                color: C.accent,
                border: `2px solid ${C.accent}`,
                borderRadius: 8,
                padding: "2px 12px",
              }}
            >
              {q}
            </span>
          ))}
        </div>
      </Reveal>
    ))}
    <Reveal
      at={250}
      style={{ ...abs(96, 860, 1728), fontSize: 32, color: C.ink }}
    >
      Q1 no leaks · Q2 wrong or old memory · Q3 proof: every tool has a job in
      the answers.
    </Reveal>
  </SceneFrame>
);

// ---------------------------------------------------------------- 3. Live chat
export const DemoChat: React.FC = () => (
  <SceneFrame eyebrow="The app running · Chat" page="3 / 7">
    <VO n={3} />
    <Screen>
      <Video
        src={staticFile("clips/chat-learn.mp4")}
        playbackRate={3.8}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </Screen>
    <Tag x={96} y={836} at={10} size={22}>
      real app · sped up 3.8×
    </Tag>
    <Points
      title="What you see"
      items={[
        { at: 26, text: "You describe an incident." },
        {
          at: 80,
          text: "The agent searches memory: some notes kept, others rejected with a reason.",
        },
        {
          at: 150,
          text: "The action is checked against an allowlist before it runs.",
        },
        { at: 214, text: "The incident is fixed." },
      ]}
    />
    <TechLine
      at={30}
      text="Next.js chat UI · Claude brain · Atlas vector search · Zod guard"
    />
  </SceneFrame>
);

// ---------------------------------------------------------------- 4. Q1 isolation
export const DemoQ1: React.FC = () => (
  <SceneFrame eyebrow="Question 1 · No leaks" page="4 / 7">
    <VO n={4} />
    <Screen>
      <Video
        src={staticFile("clips/chat-isolation.mp4")}
        playbackRate={1.6}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </Screen>
    <Tag x={96} y={836} at={10} size={22}>
      signed in as another client (bob), same question
    </Tag>
    <Points
      title="How it stops leaks"
      items={[
        { at: 30, text: "Another client asks. It only sees its own notes." },
        {
          at: 100,
          text: "Who you are comes from the login, never from what you type.",
        },
        {
          at: 170,
          text: "Every search result is re-checked before the agent sees it.",
        },
        { at: 232, text: "Proof page: 0 leaks in 300 trials." },
      ]}
    />
    <TechLine
      at={34}
      text="session → Principal on the server · Zod strips forged fields · Atlas tenant prefilter · recheck"
    />
  </SceneFrame>
);

// ---------------------------------------------------------------- 5. Q2 wrong or old memory
export const DemoQ2: React.FC = () => {
  const frame = useCurrentFrame();
  const second = interpolate(frame, [150, 168], [0, 1], clamp);
  const zoom = interpolate(frame, [0, 300], [1, 1.06], clamp);
  return (
    <SceneFrame eyebrow="Question 2 · Wrong or old memory" page="5 / 7">
      <VO n={5} />
      <Screen>
        <Img
          src={staticFile("clips/memories.png")}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            scale: String(zoom),
          }}
        />
        <Img
          src={staticFile("clips/audit.png")}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: second,
            scale: String(zoom),
          }}
        />
      </Screen>
      <Reveal
        at={70}
        style={{
          ...abs(1090, 200, 120),
          height: 100,
          border: `4px solid ${C.accent}`,
          borderRadius: 14,
          boxSizing: "border-box",
          opacity: 1 - second,
        }}
      >
        {null}
      </Reveal>
      <Tag x={96} y={836} at={10} size={22}>
        Memories page, then the Audit log
      </Tag>
      <Points
        title="How it fixes or drops memory"
        items={[
          {
            at: 30,
            text: "Every memory has an expiry. It is checked on every read.",
          },
          {
            at: 80,
            text: "Correct makes a new version. Forget removes it and what came from it.",
          },
          { at: 160, text: "The agent forgets a fix that fails." },
          { at: 220, text: "The Audit log records every step." },
        ]}
      />
      <TechLine
        at={34}
        text="expiry gate on read · tombstone then purge · Atlas audit collection · Next.js pages"
      />
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- 6. Q3 proof
const ARMS = [
  { at: 66, k: "R", name: "Real memory", res: "20 / 20 fixed" },
  { at: 110, k: "O", name: "No memory", res: "0 / 20" },
  { at: 136, k: "P", name: "Filler instead", res: "0 / 20" },
  { at: 180, k: "C", name: "Changed fact", res: "20 / 20, follows it" },
];
export const DemoQ3: React.FC = () => (
  <SceneFrame eyebrow="Question 3 · Proof" page="6 / 7">
    <VO n={6} />
    <Screen>
      <Video
        src={staticFile("clips/tour-proof.mp4")}
        playbackRate={0.4}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </Screen>
    <Tag x={96} y={836} at={10} size={22}>
      Proofs page · numbers produced by the rule brain over 20 seeds
    </Tag>
    <Reveal
      at={8}
      style={{
        ...abs(1340, 150, 484),
        fontFamily: mono,
        fontSize: 24,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        color: C.accent,
      }}
    >
      Same incident, four ways
    </Reveal>
    {ARMS.map((a, i) => (
      <Reveal
        key={a.k}
        at={a.at}
        style={{
          ...abs(1340, 210 + i * 128, 484),
          height: 108,
          boxSizing: "border-box",
          padding: "14px 20px",
          background: a.k === "C" ? C.accentTint : "#fff",
          border: `2px solid ${a.k === "C" ? C.accent : C.ink}`,
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 600 }}>
          <span style={{ fontFamily: mono, color: C.accent, marginRight: 12 }}>
            {a.k}
          </span>
          {a.name}
        </div>
        <div
          style={{
            fontFamily: mono,
            fontSize: 26,
            color: C.muted,
            marginTop: 6,
          }}
        >
          {a.res}
        </div>
      </Reveal>
    ))}
    <Reveal
      at={240}
      style={{ ...abs(96, 790, 1728), fontSize: 26, color: C.muted }}
    >
      The rule brain proves plumbing and governance, not model behavior.
    </Reveal>
    <TechLine
      at={34}
      text="seeded checkpoints · same prompt in every arm · blind scorer · Wilson intervals · Vitest"
    />
  </SceneFrame>
);

// ---------------------------------------------------------------- 7. Outro
export const DemoOutro: React.FC = () => (
  <SceneFrame eyebrow="Summary" page="7 / 7">
    <VO n={7} />
    <Headline at={4} size={130} style={abs(96, 300, 1728)}>
      Governed Memory Layer
    </Headline>
    <Reveal
      at={26}
      style={{
        ...abs(96, 520, 1728),
        fontFamily: serif,
        fontStyle: "italic",
        fontSize: 76,
        color: C.accent,
      }}
    >
      Safe · correctable · provable
    </Reveal>
    <Tag x={96} y={760} at={50} size={28}>
      README.md · docs/architecture-diagrams.html
    </Tag>
  </SceneFrame>
);

export const AppDemo60: React.FC = () => {
  const comps = [
    DemoTitle,
    DemoStack,
    DemoChat,
    DemoQ1,
    DemoQ2,
    DemoQ3,
    DemoOutro,
  ];
  let from = 0;
  return (
    <AbsoluteFill style={{ fontFamily: sans }}>
      {comps.map((Scene, i) => {
        const start = from;
        from += DEMO_SCENES[i];
        return (
          <Sequence
            key={i}
            from={start}
            durationInFrames={DEMO_SCENES[i]}
            name={Scene.name}
          >
            <Scene />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
