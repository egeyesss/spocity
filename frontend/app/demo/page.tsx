import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DemoCity from "./DemoCity";

export const metadata: Metadata = {
  title: "demo city — spocity",
  description:
    "Wander a real Spocity: a 3D voxel city built from listening history, with genre districts and buildings sized by play count.",
};

// The demo is a real city — the project owner's (earliest account with a
// built city). Falls back to the deterministic sample city when the backend
// is unreachable or nobody has logged in yet, so the demo link never breaks.
export default async function DemoPage() {
  let username: string | null = null;
  try {
    const res = await fetch(`${process.env.API_URL}/api/demo-city/`, {
      cache: "no-store",
    });
    if (res.ok) {
      username = ((await res.json()) as { username: string }).username;
    }
  } catch {
    // backend down — fall through to the sample city
  }

  // redirect() throws internally, so it must live outside the try block.
  if (username) redirect(`/${username}`);

  return <DemoCity />;
}
