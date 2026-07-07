import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicCity from "./PublicCity";
import type { CityPayload } from "../me/city/types";

// Public city page: spocity.app/<username>. Server-fetches the owner's city
// payload (no auth — cities are public by URL) and hands it to the same
// CityView the owner sees.

interface PublicCityPayload extends CityPayload {
  owner: { display_name: string; username: string };
}

async function getCity(username: string): Promise<PublicCityPayload | null> {
  try {
    const res = await fetch(
      `${process.env.API_URL}/api/city/${encodeURIComponent(username)}/`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as PublicCityPayload;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const city = await getCity(username);
  if (!city) return { title: "city not found — spocity" };
  return {
    title: `${city.owner.display_name}'s city — spocity`,
    description: `${city.artists.length} artists across ${
      new Set(city.artists.map((a) => a.primary_genre_bucket ?? "other")).size
    } genre districts — a voxel city built from real listening.`,
  };
}

export default async function PublicCityPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const city = await getCity(username);
  if (!city || city.artists.length === 0) notFound();

  return (
    <PublicCity
      data={city}
      ownerName={city.owner.display_name}
      username={city.owner.username}
    />
  );
}
