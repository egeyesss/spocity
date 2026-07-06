import { notFound } from "next/navigation";
import DevCity from "./DevCity";

// Design-QA harness: renders the real CityView with a deterministic mock
// payload so the city can be iterated on visually without Spotify OAuth or a
// running backend. Dev-only — 404s in production builds.
export default function DevCityPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevCity />;
}
