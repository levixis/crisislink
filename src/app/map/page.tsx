import MapPanel from "@/components/MapPanel";
import Nav from "@/components/Nav";
import { getSessionUser } from "@/lib/auth";
import { getMapData } from "@/lib/map-data";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const [initialData, user] = await Promise.all([getMapData(), getSessionUser()]);

  // Operations roles open on the country; everyone else opens on where they
  // actually are. Panning out to the full monitored region stays available to
  // all of them — this decides the first frame, not what they may look at.
  const scope =
    user?.role === "ADMIN" ? "national" : user?.role === "RESPONDER" ? "responder" : "citizen";

  return (
    <>
      <Nav />
      <MapPanel initialData={initialData} signedIn={user !== null} scope={scope} />
    </>
  );
}
