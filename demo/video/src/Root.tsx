import React from "react";
import { Composition } from "remotion";
import { JarvisDemo, TOTAL_FRAMES } from "./JarvisDemo";
import { fps } from "./theme";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="OttoDemo"
        component={JarvisDemo}
        durationInFrames={TOTAL_FRAMES}
        fps={fps}
        width={1920}
        height={1080}
      />
    </>
  );
};
