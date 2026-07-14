import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
// Footage clips are webm; keep color management predictable.
Config.setChromiumOpenGlRenderer("angle");
