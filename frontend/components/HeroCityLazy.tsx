"use client";

import dynamic from "next/dynamic";

// three.js only loads on the client, after the rest of the hero has painted.
// The placeholder keeps the layout stable while the chunk streams in.
const HeroCity = dynamic(() => import("./HeroCity"), {
  ssr: false,
  loading: () => <div className="h-full w-full" />,
});

export default function HeroCityLazy() {
  return <HeroCity />;
}
