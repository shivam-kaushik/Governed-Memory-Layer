import { Composition } from "remotion";
import { GovernedMemoryDemo, TOTAL_FRAMES } from "./Composition";
import { AppDemo60, DEMO_FRAMES } from "./demo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AppDemo60"
        component={AppDemo60}
        durationInFrames={DEMO_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="GovernedMemoryDemo"
        component={GovernedMemoryDemo}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
