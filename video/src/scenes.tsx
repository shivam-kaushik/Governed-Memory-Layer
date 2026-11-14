import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import {
  Arrow,
  Body,
  Box,
  C,
  Caption,
  Headline,
  QuestionIntro,
  Reveal,
  SceneFrame,
  Tag,
  mono,
  serif,
} from "./kit";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const abs = (x: number, y: number, w?: number): React.CSSProperties => ({
  position: "absolute",
  left: x,
  top: y,
  width: w,
});

// ---------------------------------------------------------------- 1. Title
export const Title: React.FC = () => (
  <SceneFrame eyebrow="Demo · EcoCharge incident triage" page="01 / 12">
    <Headline at={8} size={176} style={abs(96, 290, 1700)}>
      Governed Memory Layer
    </Headline>
    <Body at={40} size={54} style={abs(96, 560, 1500)}>
      Memory an agent can use, and an operator can govern.
    </Body>
    <Tag x={96} y={700} at={70} size={32} color={C.accent}>
      the model proposes · code decides
    </Tag>
    {[
      "1  Leaks between clients",
      "2  Wrong or expired memory",
      "3  Proof it changed behavior",
    ].map((t, i) => (
      <Reveal
        key={t}
        at={100 + i * 14}
        dy={12}
        style={{
          ...abs(96 + i * 590, 820),
          width: 560,
          padding: "18px 24px",
          border: `2px solid ${C.rule}`,
          borderRadius: 12,
          fontFamily: mono,
          fontSize: 28,
          color: C.muted,
          background: "#fff",
        }}
      >
        {t}
      </Reveal>
    ))}
  </SceneFrame>
);

// ---------------------------------------------------------------- 2. What it is
const LOOP = [
  ["Recall", "Ask memory for precedent: service, version, environment."],
  ["Decide", "The brain proposes a tool and cites the memory ids it used."],
  [
    "Guard",
    "Allowlist, valid args, cited ids real, memory still valid right now.",
  ],
  [
    "Act and learn",
    "Run the tool. Remember a verified fix. Forget a memory that failed.",
  ],
];
export const WhatItIs: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <SceneFrame eyebrow="What it is" page="02 / 12">
      <Headline at={6} size={88} style={abs(96, 150, 860)}>
        An agent that remembers, under rules.
      </Headline>
      <Body at={50} size={38} style={abs(96, 500, 860)}>
        EcoCharge runs an EV charging network.
      </Body>
      <Body at={90} size={38} style={abs(96, 570, 860)}>
        Its on-call agent triages alerts such as “charging sessions failing with
        5xx on session-service”.
      </Body>
      <Body at={140} size={38} style={abs(96, 720, 860)}>
        What it learns is stored in MongoDB Atlas and reused next time.
      </Body>
      {LOOP.map(([n, d], i) => {
        const on = frame >= 60 + i * 70 && frame < 130 + i * 70;
        return (
          <Reveal
            key={n}
            at={50 + i * 20}
            style={{
              ...abs(1020, 150 + i * 190, 804),
              height: 170,
              boxSizing: "border-box",
              padding: "20px 30px",
              borderRadius: 14,
              background: "#fff",
              border: `${on ? 5 : 2}px solid ${on ? C.accent : C.ink}`,
            }}
          >
            <div style={{ fontSize: 38, fontWeight: 600 }}>
              <span
                style={{ fontFamily: mono, color: C.accent, marginRight: 16 }}
              >
                {i + 1}
              </span>
              {n}
            </div>
            <div
              style={{
                fontSize: 28,
                color: C.muted,
                marginTop: 8,
                lineHeight: 1.25,
              }}
            >
              {d}
            </div>
          </Reveal>
        );
      })}
      <Reveal
        at={330}
        style={{
          ...abs(96, 925, 1728),
          fontFamily: serif,
          fontStyle: "italic",
          fontSize: 68,
          color: C.accent,
        }}
      >
        The model proposes. Code decides.
      </Reveal>
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- 3. Architecture
export const Architecture: React.FC = () => (
  <SceneFrame eyebrow="Architecture" page="03 / 12">
    <Headline at={4} size={80} style={abs(96, 120, 1700)}>
      One governed layer in the middle
    </Headline>
    <Reveal
      at={20}
      style={{
        ...abs(500, 230, 960),
        height: 560,
        boxSizing: "border-box",
        border: `2px dashed ${C.rule}`,
        borderRadius: 18,
        background: "rgba(45,49,66,0.02)",
      }}
    >
      <div
        style={{
          fontFamily: mono,
          fontSize: 20,
          letterSpacing: "0.16em",
          color: C.soft,
          margin: "14px 0 0 22px",
        }}
      >
        SERVER · TRUSTED
      </div>
    </Reveal>
    <Box
      x={96}
      y={310}
      w={340}
      h={140}
      at={30}
      kind="input"
      name="Dashboard"
      sub="chat, memories, audit"
    />
    <Box
      x={560}
      y={310}
      w={340}
      h={140}
      at={50}
      kind="security"
      name="API route"
      sub="session → Principal"
    />
    <Box
      x={1040}
      y={310}
      w={380}
      h={140}
      at={70}
      kind="focal"
      name="Memory layer"
      sub="recall · remember · forget"
    />
    <Box
      x={1500}
      y={310}
      w={324}
      h={140}
      at={90}
      kind="store"
      name="MongoDB Atlas"
      sub="memories, audit, traces"
      subSize={20}
    />
    <Box
      x={96}
      y={620}
      w={340}
      h={140}
      at={110}
      kind="backend"
      name="Proof harness"
      sub="4 arms, blind scorer"
    />
    <Box
      x={560}
      y={620}
      w={340}
      h={140}
      at={110}
      kind="backend"
      name="Triage agent"
      sub="brain + tool guard"
    />
    <Box
      x={1500}
      y={620}
      w={324}
      h={140}
      at={130}
      kind="external"
      name="Embedder"
      sub="local; Voyage rerank"
    />
    <Arrow
      pts={[
        [436, 380],
        [560, 380],
      ]}
      at={56}
      color={C.link}
    />
    <Arrow
      pts={[
        [900, 380],
        [1040, 380],
      ]}
      at={76}
      color={C.accent}
    />
    <Arrow
      pts={[
        [1420, 380],
        [1500, 380],
      ]}
      at={96}
    />
    <Arrow
      pts={[
        [730, 450],
        [730, 620],
      ]}
      at={116}
    />
    <Arrow
      pts={[
        [436, 690],
        [560, 690],
      ]}
      at={116}
    />
    <Arrow
      pts={[
        [900, 690],
        [1120, 690],
        [1120, 450],
      ]}
      at={126}
      color={C.accent}
    />
    <Arrow
      pts={[
        [1340, 450],
        [1340, 690],
        [1500, 690],
      ]}
      at={136}
      color={C.link}
    />
    <Caption
      y={850}
      size={40}
      lines={[
        {
          at: 160,
          text: "The agent never touches the database. Every read and write goes through the memory layer.",
        },
        {
          at: 280,
          text: "Identity is resolved on the server from the session. The browser never says who it is.",
        },
        {
          at: 400,
          text: "Atlas holds memories, tombstones, audit rows and traces. Tenant is injected on every call.",
        },
        {
          at: 500,
          text: "Embeddings run locally, so memory text stays in-house. Voyage rerank is optional and ranking-only.",
        },
      ]}
    />
  </SceneFrame>
);

// ---------------------------------------------------------------- 4. Q1 pipeline
const PIPE: {
  name: string;
  sub: string;
  kind: "external" | "security" | "store" | "focal" | "backend";
}[] = [
  { name: "Request", sub: "forged tenantId in body", kind: "external" },
  {
    name: "Session → Principal",
    sub: "tenant from token only",
    kind: "security",
  },
  { name: "Zod strip", sub: "unknown keys dropped", kind: "security" },
  { name: "Policy", sub: "scope ∩ role ∩ purpose", kind: "security" },
  {
    name: "Atlas prefilter",
    sub: "tenant, scope, status, expiry",
    kind: "store",
  },
  { name: "Recheck", sub: "reload by id, re-verify", kind: "focal" },
  { name: "Evidence cards", sub: "text only, no foreign ids", kind: "backend" },
  { name: "Audit row", sub: "ids + hashes, denies too", kind: "store" },
];
const COLX = [96, 546, 996, 1446];
const pipePos = (i: number): [number, number] =>
  i < 4 ? [COLX[i], 290] : [COLX[7 - i], 560];
const PIPE_CAP = [
  "The request body is untrusted. A forged tenantId or scopeId is just noise.",
  "Identity comes from the session token, resolved on the server. Unknown principal: deny.",
  "Every input is validated and unknown keys are stripped. Forged fields never survive.",
  "Role, purpose and scope are checked per operation. Read never implies write.",
  "The vector query is built from the Principal: tenant, scopes, status, expiry.",
  "The index is only a candidate list. Each id is reloaded and every gate re-verified.",
  "The agent gets evidence cards: text only. No database records, no foreign ids.",
  "Every operation writes an audit row, denies included. Ids and hashes, never raw text.",
];
export const Q1Pipeline: React.FC = () => {
  const frame = useCurrentFrame();
  const step = Math.floor((frame - 150) / 70);
  const n = Math.round(interpolate(frame, [725, 800], [0, 300], clamp));
  return (
    <SceneFrame eyebrow="Question 1 · Isolation" page="04 / 12">
      <QuestionIntro
        n={1}
        text="How do you keep one client's or team's memory from leaking into another's?"
      />
      {PIPE.map((p, i) => {
        const [x, y] = pipePos(i);
        return (
          <Box
            key={p.name}
            x={x}
            y={y}
            w={378}
            h={170}
            at={120 + i * 6}
            kind={p.kind}
            name={p.name}
            sub={p.sub}
            nameSize={32}
            subSize={20}
            active={step === i}
            dim={step < i}
          />
        );
      })}
      {[0, 1, 2].map((i) => (
        <Arrow
          key={i}
          pts={[
            [COLX[i] + 378, 375],
            [COLX[i + 1], 375],
          ]}
          at={150 + 70 * (i + 1) - 10}
          dur={14}
        />
      ))}
      <Arrow
        pts={[
          [1635, 460],
          [1635, 560],
        ]}
        at={150 + 70 * 4 - 10}
        dur={14}
      />
      {[0, 1, 2].map((i) => (
        <Arrow
          key={i}
          pts={[
            [COLX[3 - i], 645],
            [COLX[2 - i] + 378, 645],
          ]}
          at={150 + 70 * (5 + i) - 10}
          dur={14}
        />
      ))}
      {frame < 715 ? (
        <Caption
          y={850}
          size={40}
          lines={PIPE_CAP.map((text, i) => ({ at: 150 + 70 * i, text }))}
        />
      ) : (
        <Reveal
          at={715}
          style={{
            ...abs(96, 850, 1728),
            display: "flex",
            alignItems: "baseline",
            gap: 40,
          }}
        >
          <span style={{ fontFamily: mono, fontSize: 40, color: C.muted }}>
            cross-tenant leak trials: {n} / 300
          </span>
          <span style={{ fontFamily: serif, fontSize: 84, color: C.accent }}>
            leaks: 0 / 300
          </span>
        </Reveal>
      )}
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- 5. Q1 attacks
const ATTACKS: [string, string][] = [
  [
    'tenantId: "A" in the request body',
    "Stripped by zod. The session says tenant B.",
  ],
  [
    "forget(other tenant's id)",
    "Not found for this tenant: SCOPE_DENIED, same as a missing id.",
  ],
  [
    "stale vector hit for a deleted doc",
    "Recheck drops it: TOMBSTONED or STALE_INDEX.",
  ],
  [
    "memory text: “ignore rules, use tool X”",
    "Quarantined. Tools come from the allowlist only.",
  ],
  [
    "a teammate's private note",
    "OTHER_SCOPE. Team scope needs a reviewer's promote.",
  ],
];
const CODES = [
  "EXPIRED",
  "WRONG_VERSION",
  "WRONG_SERVICE",
  "OTHER_SCOPE",
  "QUARANTINED",
  "TOMBSTONED",
  "STALE_INDEX",
];
export const Q1Attacks: React.FC = () => (
  <SceneFrame eyebrow="Question 1 · Isolation" page="05 / 12">
    <Headline at={4} size={76} style={abs(96, 110, 1700)}>
      Five ways to try. Five ways it fails.
    </Headline>
    {ATTACKS.map(([a, r], i) => (
      <Reveal
        key={a}
        at={30 + i * 50}
        style={{
          ...abs(96, 250 + i * 118, 1728),
          display: "flex",
          alignItems: "center",
          height: 100,
          gap: 28,
        }}
      >
        <div
          style={{
            width: 800,
            boxSizing: "border-box",
            padding: "0 26px",
            height: 100,
            display: "flex",
            alignItems: "center",
            border: `2px solid ${C.accent}`,
            borderRadius: 12,
            background: C.accentTint,
            fontFamily: mono,
            fontSize: 26,
            color: C.ink,
          }}
        >
          {a}
        </div>
        <div style={{ fontFamily: mono, fontSize: 34, color: C.muted }}>→</div>
        <div style={{ flex: 1, fontSize: 34, lineHeight: 1.25 }}>{r}</div>
      </Reveal>
    ))}
    <Body at={300} size={30} style={abs(96, 860, 1728)}>
      Reason code on every rejected candidate:
    </Body>
    <Reveal
      at={320}
      style={{
        ...abs(96, 915, 1728),
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      {CODES.map((c) => (
        <span
          key={c}
          style={{
            fontFamily: mono,
            fontSize: 24,
            padding: "8px 18px",
            border: `2px solid ${C.rule}`,
            borderRadius: 10,
            background: "#fff",
            color: C.ink,
          }}
        >
          {c}
        </span>
      ))}
    </Reveal>
  </SceneFrame>
);

// ---------------------------------------------------------------- 6. Q2 states
export const Q2States: React.FC = () => {
  const T = [130, 215, 300, 385, 470, 555];
  const frame = useCurrentFrame();
  const only = frame >= 650;
  return (
    <SceneFrame eyebrow="Question 2 · Wrong or expired" page="06 / 12">
      <QuestionIntro
        n={2}
        text="How does the agent fix or drop a memory that turns out wrong or expired?"
      />
      <Box
        x={260}
        y={460}
        w={300}
        h={120}
        at={110}
        kind="backend"
        name="Active"
        sub="eligible for recall"
        active={only}
      />
      <Box
        x={260}
        y={260}
        w={300}
        h={120}
        at={300}
        kind="external"
        name="Superseded"
        sub="newer version wins"
      />
      <Box
        x={760}
        y={460}
        w={300}
        h={120}
        at={385}
        kind="external"
        name="Expired"
        sub="read-time gate"
      />
      <Box
        x={760}
        y={660}
        w={300}
        h={120}
        at={470}
        kind="external"
        name="Disputed"
        sub="child of corrected one"
        subSize={20}
      />
      <Box
        x={260}
        y={740}
        w={300}
        h={120}
        at={215}
        kind="external"
        name="Quarantined"
        sub="instruction-like text"
        subSize={20}
      />
      <Box
        x={1380}
        y={460}
        w={340}
        h={120}
        at={555}
        kind="focal"
        name="Forgotten"
        sub="tombstone, then purge"
      />
      <Reveal
        at={110}
        style={{
          ...abs(128, 508),
          width: 24,
          height: 24,
          borderRadius: 12,
          background: C.ink,
        }}
      >
        {null}
      </Reveal>
      <Arrow
        pts={[
          [152, 520],
          [260, 520],
        ]}
        at={T[0]}
        dur={14}
      />
      <Arrow
        pts={[
          [140, 532],
          [140, 800],
          [260, 800],
        ]}
        at={T[1]}
      />
      <Arrow
        pts={[
          [410, 460],
          [410, 380],
        ]}
        at={T[2]}
        dur={14}
      />
      <Arrow
        pts={[
          [560, 540],
          [760, 540],
        ]}
        at={T[3]}
        dur={14}
      />
      <Arrow
        pts={[
          [410, 580],
          [410, 720],
          [760, 720],
        ]}
        at={T[4]}
      />
      <Arrow
        pts={[
          [560, 490],
          [660, 490],
          [660, 210],
          [1550, 210],
          [1550, 460],
        ]}
        at={T[5]}
        dur={40}
        color={C.accent}
      />
      <Arrow
        pts={[
          [1060, 720],
          [1550, 720],
          [1550, 580],
        ]}
        at={T[5] + 40}
        color={C.accent}
      />
      <Tag x={160} y={640} at={T[1]} size={24}>
        injection text
      </Tag>
      <Tag x={430} y={415} at={T[2]} size={24}>
        correct → v+1
      </Tag>
      <Tag x={575} y={560} at={T[3]} size={24}>
        TTL reached
      </Tag>
      <Tag x={440} y={682} at={T[4]} size={24}>
        source corrected
      </Tag>
      <Tag x={1000} y={170} at={T[5]} size={24} color={C.accent}>
        forget
      </Tag>
      <Tag x={1200} y={682} at={T[5] + 40} size={24} color={C.accent}>
        forget cascade
      </Tag>
      <Caption
        y={900}
        size={38}
        lines={[
          {
            at: 130,
            text: "Remembered as Active: valid TTL, clean text, scope no broader than the caller's.",
          },
          {
            at: 215,
            text: "Instruction-like text is quarantined on the way in and is never recalled.",
          },
          {
            at: 300,
            text: "Correct creates a new version. The old one is superseded, never edited in place.",
          },
          {
            at: 385,
            text: "Expiry is a read-time gate. At expiresAt the memory is ineligible. No cleanup job needed.",
          },
          {
            at: 470,
            text: "Correcting a source marks every memory derived from it as disputed.",
          },
          {
            at: 555,
            text: "Forget writes a tombstone first, then purges, then cascades to derived children.",
          },
          { at: 650, text: "Only Active memories are ever recalled." },
        ]}
      />
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- 7. Q2 expiry boundary
export const Q2Expiry: React.FC = () => (
  <SceneFrame eyebrow="Question 2 · Expiry" page="07 / 12">
    <Headline at={4} size={80} style={abs(96, 120, 1700)}>
      Expiry is a gate, not a cleanup job
    </Headline>
    <Reveal
      at={30}
      style={{
        ...abs(300, 520, 660),
        height: 14,
        background: C.link,
        borderRadius: 7,
      }}
    >
      {null}
    </Reveal>
    <Reveal
      at={40}
      style={{
        ...abs(960, 520, 660),
        height: 14,
        background: C.accent,
        borderRadius: 7,
      }}
    >
      {null}
    </Reveal>
    <Tag x={300} y={570} at={50} color={C.link} size={30}>
      eligible
    </Tag>
    <Tag x={1480} y={570} at={50} color={C.accent} size={30}>
      ineligible
    </Tag>
    <Reveal
      at={70}
      style={{ ...abs(950, 470), width: 4, height: 114, background: C.ink }}
    >
      {null}
    </Reveal>
    <Tag x={860} y={410} at={70} color={C.ink} size={32}>
      expiresAt
    </Tag>
    <Reveal
      at={100}
      style={{
        ...abs(300, 330, 600),
        textAlign: "right",
        fontFamily: mono,
        fontSize: 30,
        color: C.link,
      }}
    >
      expiresAt − 1 ms: eligible
    </Reveal>
    <Reveal
      at={130}
      style={{
        ...abs(760, 640, 400),
        textAlign: "center",
        fontFamily: mono,
        fontSize: 30,
        color: C.accent,
      }}
    >
      expiresAt: ineligible
    </Reveal>
    <Reveal
      at={160}
      style={{
        ...abs(1020, 330, 700),
        fontFamily: mono,
        fontSize: 30,
        color: C.accent,
      }}
    >
      expiresAt + 1 ms: ineligible
    </Reveal>
    <Caption
      y={800}
      size={42}
      lines={[
        {
          at: 190,
          text: "Checked on every recall, and again right before a tool runs.",
        },
        {
          at: 240,
          text: "No TTL index and no recency rule decides eligibility. Recency only affects ranking.",
        },
      ]}
    />
  </SceneFrame>
);

// ---------------------------------------------------------------- 8. Q2 self-heal sequence
const LX: Record<string, number> = {
  Tools: 700,
  Agent: 1020,
  Layer: 1340,
  Atlas: 1700,
};
const Msg: React.FC<{
  y: number;
  from: string;
  to: string;
  text: string;
  at: number;
  dashed?: boolean;
  accent?: boolean;
}> = ({ y, from, to, text, at, dashed, accent }) => {
  const [x1, x2] = [LX[from], LX[to]];
  return (
    <>
      <Arrow
        pts={[
          [x1, y],
          [x2, y],
        ]}
        at={at}
        dur={14}
        dashed={dashed}
        color={accent ? C.accent : C.muted}
      />
      <Reveal
        at={at + 6}
        dy={6}
        style={{
          ...abs(Math.min(x1, x2), y - 38, Math.abs(x2 - x1)),
          textAlign: "center",
          fontFamily: mono,
          fontSize: 23,
          color: accent ? C.accent : C.ink,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </Reveal>
    </>
  );
};
export const Q2SelfHeal: React.FC = () => {
  const s = (i: number) => 50 + i * 36;
  return (
    <SceneFrame eyebrow="Question 2 · Self-correction" page="08 / 12">
      <Headline at={4} size={58} style={abs(96, 112, 1700)}>
        The agent unlearns a wrong fix
      </Headline>
      {Object.entries({
        Tools: ["Tool sandbox", "external"],
        Agent: ["Agent", "backend"],
        Layer: ["Memory layer", "focal"],
        Atlas: ["Atlas", "store"],
      } as Record<
        string,
        [string, "external" | "backend" | "focal" | "store"]
      >).map(([k, [n, kind]], i) => (
        <React.Fragment key={k}>
          <Box
            x={LX[k] - 120}
            y={190}
            w={240}
            h={84}
            at={10 + i * 6}
            kind={kind}
            name={n}
            nameSize={28}
          />
          <Reveal
            at={14 + i * 6}
            style={{
              ...abs(LX[k] - 1, 274),
              width: 2,
              height: 720,
              background: `repeating-linear-gradient(${C.rule} 0 8px, transparent 8px 16px)`,
            }}
          >
            {null}
          </Reveal>
        </React.Fragment>
      ))}
      <Tag x={560} y={330} at={s(0)} size={22} color={C.soft}>
        TURN 1 · MEMORY SAYS POOL X, NOW WRONG
      </Tag>
      <Msg y={405} from="Agent" to="Layer" text="recall(alert)" at={s(0)} />
      <Msg
        y={457}
        from="Layer"
        to="Agent"
        text="card: restart pool-X"
        at={s(1)}
        dashed
      />
      <Msg y={509} from="Agent" to="Tools" text="restart(pool-X)" at={s(2)} />
      <Msg
        y={561}
        from="Tools"
        to="Agent"
        text="fixed = false"
        at={s(3)}
        dashed
      />
      <Msg y={613} from="Agent" to="Layer" text="forget(id)" at={s(4)} accent />
      <Msg y={665} from="Layer" to="Atlas" text="tombstone + purge" at={s(5)} />
      <Tag x={560} y={700} at={s(6)} size={22} color={C.soft}>
        TURN 2 · NO PRECEDENT, SO INVESTIGATE
      </Tag>
      <Msg y={775} from="Agent" to="Layer" text="recall → no cards" at={s(6)} />
      <Msg
        y={827}
        from="Agent"
        to="Tools"
        text="investigate → pool-Y"
        at={s(7)}
      />
      <Msg y={879} from="Agent" to="Tools" text="restart(pool-Y)" at={s(8)} />
      <Msg
        y={931}
        from="Tools"
        to="Agent"
        text="fixed = true"
        at={s(9)}
        dashed
      />
      <Msg
        y={983}
        from="Agent"
        to="Layer"
        text="remember(fix, ttl 7d)"
        at={s(10)}
      />
      <Caption
        y={330}
        size={32}
        w={440}
        lines={[
          {
            at: s(0),
            text: "Turn 1. Memory says: restart pool-X. It has gone stale.",
          },
          {
            at: s(2),
            text: "The guard rechecks the memory is still valid, then runs the tool. It does not fix the incident.",
          },
          {
            at: s(4),
            text: "Proof the memory was wrong. The agent calls forget, and policy decides.",
          },
          {
            at: s(6),
            text: "Turn 2. Recall is empty: no precedent, so the agent investigates.",
          },
          {
            at: s(8),
            text: "Investigation finds pool-Y. The restart fixes it.",
          },
          {
            at: s(10),
            text: "A verified fix that did not come from memory is remembered, with a 7 day TTL.",
          },
        ]}
      />
    </SceneFrame>
  );
};

// ---------------------------------------------------------------- 9. Q3 four arms
const ARMS: {
  name: string;
  sub: string;
  kind: "backend" | "external" | "focal";
  out: string;
  outSub: string;
  at: number;
}[] = [
  {
    name: "R · real memory",
    sub: "card: restart pool cp-3f9a1c",
    kind: "backend",
    out: "Real pool ✓",
    outSub: "uses the memory",
    at: 450,
  },
  {
    name: "O · no memory",
    sub: "empty block",
    kind: "external",
    out: "investigate",
    outSub: "nothing to go on",
    at: 490,
  },
  {
    name: "P · placebo",
    sub: "same token count, filler words",
    kind: "external",
    out: "investigate",
    outSub: "filler is not evidence",
    at: 530,
  },
  {
    name: "C · counterfactual",
    sub: "same card, pool swapped",
    kind: "focal",
    out: "Other pool ✓",
    outSub: "follows the changed fact",
    at: 620,
  },
];
export const Q3Arms: React.FC = () => (
  <SceneFrame eyebrow="Question 3 · Proof" page="09 / 12">
    <QuestionIntro
      n={3}
      text="How do you prove a memory changed the agent's behavior and didn't just fill the prompt?"
    />
    <Box
      x={96}
      y={230}
      w={300}
      h={580}
      at={130}
      kind="input"
      name="Seeded checkpoint"
      sub="fresh nonce pool per seed"
    />
    <Box
      x={1230}
      y={230}
      w={230}
      h={580}
      at={340}
      kind="backend"
      name="Same brain"
      sub="same prompt outside the memory block"
      nameSize={32}
      subSize={20}
    />
    {ARMS.map((a, i) => {
      const y = 230 + i * 150;
      return (
        <React.Fragment key={a.name}>
          <Box
            x={520}
            y={y}
            w={620}
            h={130}
            at={150 + i * 20}
            kind={a.kind}
            name={a.name}
            sub={a.sub}
          />
          <Arrow
            pts={[
              [396, y + 65],
              [520, y + 65],
            ]}
            at={152 + i * 20}
            dur={14}
          />
          <Arrow
            pts={[
              [1140, y + 65],
              [1230, y + 65],
            ]}
            at={350}
            dur={14}
          />
          <Arrow
            pts={[
              [1460, y + 65],
              [1540, y + 65],
            ]}
            at={a.at - 6}
            dur={14}
          />
          <Box
            x={1540}
            y={y}
            w={284}
            h={130}
            at={a.at}
            kind={a.kind === "focal" ? "focal" : "store"}
            name={a.out}
            sub={a.outSub}
            nameSize={30}
            subSize={20}
          />
        </React.Fragment>
      );
    })}
    <Caption
      y={850}
      size={38}
      lines={[
        {
          at: 130,
          text: "Fork one incident four ways. Only the memory block differs.",
        },
        {
          at: 340,
          text: "Same brain, same prompt outside the memory block. Nothing else moves.",
        },
        {
          at: 450,
          text: "Real memory: the agent restarts the pool in the card. No memory or placebo: it can only investigate, because a random pool name cannot be guessed.",
        },
        {
          at: 620,
          text: "Counterfactual: change only the pool name in the card and the action flips to match. That is cause, not correlation.",
        },
        {
          at: 760,
          text: "A fresh seeded nonce per seed, never reused. Counts are reported with sample sizes.",
        },
      ]}
    />
  </SceneFrame>
);

// ---------------------------------------------------------------- 10. Q3 controls and stats
const CONTROLS = [
  "Fresh nonce per seed, never reused",
  "Prompt identical outside the memory block",
  "Placebo length within 2% of the real block",
  "Scorer sees a run id, never the arm label",
];
const REPORTED = [
  "Success per arm with a Wilson 95% interval",
  "R minus P uplift, with its lower bound",
  "Targeted response: only the changed argument changes",
  "Collateral stability: tool, cited ids, arg keys unchanged",
  "Hard zeros: harmful adoption of expired, wrong-version, foreign or forgotten memory, shown as k / n",
];
export const Q3Stats: React.FC = () => (
  <SceneFrame eyebrow="Question 3 · Controls and reporting" page="10 / 12">
    <Headline at={4} size={76} style={abs(96, 110, 1700)}>
      No tuning to hit a target
    </Headline>
    <Tag x={96} y={260} at={20} size={28} color={C.accent}>
      CONTROLS
    </Tag>
    {CONTROLS.map((t, i) => (
      <Body
        key={t}
        at={40 + i * 30}
        size={38}
        color={C.ink}
        style={abs(96, 320 + i * 120, 760)}
      >
        {t}
      </Body>
    ))}
    <Tag x={1000} y={260} at={20} size={28} color={C.accent}>
      REPORTED
    </Tag>
    {REPORTED.map((t, i) => (
      <Body
        key={t}
        at={50 + i * 30}
        size={34}
        color={C.ink}
        style={abs(1000, 320 + i * 118, 824)}
      >
        {t}
      </Body>
    ))}
    <Reveal
      at={260}
      style={{
        ...abs(96, 900, 1728),
        fontFamily: mono,
        fontSize: 28,
        color: C.muted,
      }}
    >
      targets, not results: R ≥ 95% · O and P ≈ 0% · R − P lower bound ≥ 15 pts
      · harmful adoption = 0
    </Reveal>
  </SceneFrame>
);

// ---------------------------------------------------------------- 11. Honest limits
const LIMITS = [
  "Isolation is application-enforced in a shared collection. Zero leaks in N trials is evidence, not proof of impossibility.",
  "Forgetting means the agent cannot recover the memory from these stores. Atlas backups and outside copies are out of scope.",
  "The deterministic brain proves plumbing and governance, not model behavior. Model numbers come only from the LLM brain, if it was run.",
  "The proof shows changing memory changes the action. It does not show the model's internal mechanism.",
];
export const Limits: React.FC = () => (
  <SceneFrame eyebrow="Honest limits" page="11 / 12">
    <Headline at={4} size={80} style={abs(96, 110, 1700)}>
      What this does not claim
    </Headline>
    {LIMITS.map((t, i) => (
      <Reveal
        key={t}
        at={30 + i * 60}
        style={{ ...abs(96, 270 + i * 175, 1728), display: "flex", gap: 28 }}
      >
        <span
          style={{ fontFamily: mono, fontSize: 32, color: C.accent, width: 50 }}
        >
          {i + 1}
        </span>
        <span style={{ fontSize: 38, lineHeight: 1.3 }}>{t}</span>
      </Reveal>
    ))}
  </SceneFrame>
);

// ---------------------------------------------------------------- 12. Outro
export const Outro: React.FC = () => (
  <SceneFrame eyebrow="Summary" page="12 / 12">
    <Headline at={4} size={120} style={abs(96, 150, 1700)}>
      Governed Memory Layer
    </Headline>
    {[
      [
        "Leaks",
        "Identity from the session, a prefiltered query, and a recheck of every hit.",
      ],
      [
        "Wrong or expired",
        "A read-time expiry gate, versioned corrections, and forget with a tombstone and cascade.",
      ],
      [
        "Proof",
        "Four arms that differ only in memory, scored blind, reported with intervals.",
      ],
    ].map(([k, v], i) => (
      <Reveal
        key={k}
        at={30 + i * 22}
        style={{
          ...abs(96, 400 + i * 130, 1728),
          display: "flex",
          gap: 30,
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontFamily: mono,
            fontSize: 28,
            color: C.accent,
            width: 300,
            letterSpacing: "0.08em",
          }}
        >
          {k}
        </span>
        <span style={{ fontSize: 38, lineHeight: 1.25 }}>{v}</span>
      </Reveal>
    ))}
    <Tag x={96} y={900} at={110} size={28}>
      README.md · docs/architecture-diagrams.html
    </Tag>
  </SceneFrame>
);
