import type { Metadata } from "next";
import DemoCity from "./DemoCity";

export const metadata: Metadata = {
  title: "sample city — spocity",
  description:
    "Wander a sample Spocity: a 3D voxel city built from listening history, with genre districts and buildings sized by play count.",
};

// Public, production-enabled sample city — the no-login way to experience
// the product (Spotify dev-mode apps cap OAuth at 25 allowlisted users, so
// visitors need a path that skips auth entirely).
export default function DemoPage() {
  return <DemoCity />;
}
