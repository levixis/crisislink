import MapPanel from "@/components/MapPanel";
import Nav from "@/components/Nav";
import { getSessionUser } from "@/lib/auth";
import { getMapData } from "@/lib/map-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Rendered server-side so the map has real pins in the first paint; the
  // client polls /api/map for updates from there.
  const [initialData, user] = await Promise.all([getMapData(), getSessionUser()]);

  return (
    <>
      <Nav />
      <MapPanel initialData={initialData} signedIn={user !== null} />
    </>
  );
}
