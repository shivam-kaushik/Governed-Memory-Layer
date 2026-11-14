import { AbsoluteFill, Sequence } from "remotion";
import {
  Architecture,
  Limits,
  Outro,
  Q1Attacks,
  Q1Pipeline,
  Q2Expiry,
  Q2SelfHeal,
  Q2States,
  Q3Arms,
  Q3Stats,
  Title,
  WhatItIs,
} from "./scenes";

// Scene order and length in frames at 30 fps.
export const SCENES = [
  { C: Title, frames: 180 },
  { C: WhatItIs, frames: 450 },
  { C: Architecture, frames: 540 },
  { C: Q1Pipeline, frames: 840 },
  { C: Q1Attacks, frames: 420 },
  { C: Q2States, frames: 780 },
  { C: Q2Expiry, frames: 300 },
  { C: Q2SelfHeal, frames: 540 },
  { C: Q3Arms, frames: 840 },
  { C: Q3Stats, frames: 360 },
  { C: Limits, frames: 330 },
  { C: Outro, frames: 180 },
];
export const TOTAL_FRAMES = SCENES.reduce((n, s) => n + s.frames, 0);

export const GovernedMemoryDemo: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill>
      {SCENES.map(({ C, frames }, i) => {
        const start = from;
        from += frames;
        return (
          <Sequence
            key={i}
            from={start}
            durationInFrames={frames}
            name={C.name}
          >
            <C />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
