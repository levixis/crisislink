/**
 * Demo data generator.
 *
 * READ THIS BEFORE DESCRIBING IT TO ANYONE — the distinction matters.
 *
 * This script does NOT insert rows into the database. It registers accounts and
 * submits reports through the real HTTP API, exactly as a browser would, so
 * every report goes through the genuine pipeline: ingest guards, PostGIS
 * clustering, confidence scoring, text classification and state transitions.
 * What lands in the database is produced by the system under test, not by this
 * file. It is a load-test harness, not a fixture.
 *
 * That is why the resulting confidence scores and states are not written here:
 * they are whatever the scorer decides. If the formula changes, the demo data
 * changes with it. Fabricated rows would not.
 *
 * Locations are real Indian cities and the text is written the way a member of
 * the public would write it — hesitant, partial, occasionally wrong about
 * which hazard they are looking at.
 *
 *   npm run seed:demo                 # against localhost
 *   BASE_URL=https://... npm run seed:demo
 */
import "dotenv/config";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = "hunter2hunter2";
/** Spacing between submissions, to stay under the classifier's rate limit. */
const PACE_MS = 2500;

type Report = {
  description: string;
  severity: number;
  peopleInDanger?: number;
  helpNeeded?: string[];
  /** Metres of jitter from the cluster centre, so reports are not co-located. */
  offset?: [number, number];
};

type Cluster = {
  place: string;
  disasterType: string;
  lat: number;
  lng: number;
  reports: Report[];
};

/**
 * Deliberately spread across confidence states so the dashboard shows the full
 * ladder rather than five identical verified incidents.
 */
const CLUSTERS: Cluster[] = [
  {
    place: "Dadar, Mumbai",
    disasterType: "FLOOD",
    lat: 19.0176,
    lng: 72.8562,
    reports: [
      { description: "Water is above my knees outside the station and it is still coming up. Buses have stopped.", severity: 4, peopleInDanger: 0, helpNeeded: ["Evacuation"], offset: [0, 0] },
      { description: "Whole stretch of the road near the market is under water. Two autos are stuck and people are wading through.", severity: 5, peopleInDanger: 6, helpNeeded: ["Rescue", "Evacuation"], offset: [0.0012, 0.0009] },
      { description: "Ground floor shops are flooding here. Shopkeepers moving stock upstairs.", severity: 4, offset: [-0.0009, 0.0014] },
      { description: "Water entering the building compound now. Old people on the ground floor cannot move quickly.", severity: 5, peopleInDanger: 4, helpNeeded: ["Rescue", "Medical"], offset: [0.0018, -0.0006] },
      { description: "Still rising. Manhole covers have come off, very dangerous to walk here.", severity: 5, peopleInDanger: 2, offset: [-0.0014, -0.0011] },
    ],
  },
  {
    place: "Guwahati, Assam",
    disasterType: "LANDSLIDE",
    lat: 26.1445,
    lng: 91.7362,
    reports: [
      { description: "Part of the hillside has come down onto the road behind our colony. Mud and stones everywhere.", severity: 4, peopleInDanger: 3, helpNeeded: ["Rescue"], offset: [0, 0] },
      { description: "The slope above the houses has slipped after last night's rain. Two houses look damaged.", severity: 4, peopleInDanger: 5, helpNeeded: ["Rescue", "Shelter"], offset: [0.0011, 0.0007] },
      { description: "Road is completely blocked by debris, nobody can get vehicles through.", severity: 3, offset: [-0.0008, 0.0012] },
      { description: "More soil coming down slowly. People are moving away from the lower houses.", severity: 4, peopleInDanger: 2, offset: [0.0015, -0.0004] },
    ],
  },
  {
    place: "T. Nagar, Chennai",
    disasterType: "STORM",
    lat: 13.0418,
    lng: 80.2341,
    reports: [
      { description: "Very strong wind and heavy rain since about an hour. A tree has come down across the service lane.", severity: 4, helpNeeded: ["Power / communications"], offset: [0, 0] },
      { description: "Power is out in the whole street and there are branches and hoardings on the road.", severity: 3, offset: [0.0013, 0.0008] },
      { description: "Tin sheets from a roof have blown off and landed near the bus stop. Nobody hurt so far.", severity: 3, offset: [-0.0007, 0.0011] },
    ],
  },
  {
    place: "Karol Bagh, Delhi",
    disasterType: "FIRE",
    lat: 28.6519,
    lng: 77.1909,
    reports: [
      { description: "Thick smoke coming out of the upper floor of a shop building. People are running out onto the street.", severity: 4, peopleInDanger: 8, helpNeeded: ["Rescue", "Medical"], offset: [0, 0] },
      { description: "I can see flames from the second floor window now. Fire brigade has not arrived yet.", severity: 5, peopleInDanger: 5, offset: [0.0008, 0.0006] },
    ],
  },
  {
    place: "Salt Lake, Kolkata",
    disasterType: "FLOOD",
    lat: 22.5808,
    lng: 88.4162,
    reports: [
      { description: "Street outside our block has waterlogged badly after the rain, about ankle deep and slowly increasing.", severity: 2, offset: [0, 0] },
    ],
  },
  {
    place: "Koramangala, Bengaluru",
    disasterType: "BUILDING_COLLAPSE",
    lat: 12.9352,
    lng: 77.6245,
    reports: [
      // A first-hand account and a second-hand one, so the dashboard shows the
      // hearsay discount working on real data.
      { description: "A portion of the boundary wall and part of an old structure has collapsed near the main road. Dust everywhere.", severity: 4, peopleInDanger: 2, helpNeeded: ["Rescue"], offset: [0, 0] },
      { description: "My neighbour told me a building has come down near the junction. I have not gone to see it myself.", severity: 3, offset: [0.001, 0.0005] },
    ],
  },
  {
    place: "Pune (mislabelled report)",
    disasterType: "FLOOD",
    lat: 18.5204,
    lng: 73.8567,
    reports: [
      // Text describes a fire but FLOOD was selected — exercises the
      // type-mismatch path in the classifier.
      { description: "There is a lot of smoke and I can smell burning from the godown behind our lane. Something is on fire.", severity: 3, offset: [0, 0] },
    ],
  },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function register(tag: string, n: number): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Demo Reporter ${n}`,
      email: `demo.${tag}.${n}@crisislink.demo`,
      password: PASSWORD,
    }),
  });
  if (response.status !== 201) throw new Error(`register failed: ${response.status}`);
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function main() {
  const tag = Date.now().toString(36);
  console.log(`Driving the real API at ${BASE_URL}\n`);
  let n = 0;

  for (const cluster of CLUSTERS) {
    let last: { id: string; state: string; confidenceScore: number; reportCount: number } | null =
      null;

    for (const report of cluster.reports) {
      // A separate account per report: reports from one account are not
      // independent evidence, and the rate limiter would reject them anyway.
      const cookie = await register(tag, n++);
      const [dLat, dLng] = report.offset ?? [0, 0];

      const response = await fetch(`${BASE_URL}/api/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie },
        body: JSON.stringify({
          clientId: crypto.randomUUID(),
          disasterType: cluster.disasterType,
          severity: report.severity,
          description: report.description,
          peopleInDanger: report.peopleInDanger ?? 0,
          helpNeeded: report.helpNeeded ?? [],
          mediaUrls: [],
          lat: cluster.lat + dLat,
          lng: cluster.lng + dLng,
          accuracy: 8 + Math.random() * 25,
          clientCreatedAt: new Date().toISOString(),
        }),
      });

      const body = await response.json();
      if (response.status !== 201) {
        console.log(`  ! ${cluster.place}: ${response.status} ${body.error ?? ""}`);
        break;
      }
      last = body.incident;
      await sleep(PACE_MS);
    }

    if (last) {
      console.log(
        `${cluster.place.padEnd(28)} ${cluster.disasterType.padEnd(18)} ` +
          `${String(last.reportCount).padStart(2)} reports  ` +
          `${last.confidenceScore.toFixed(3)}  ${last.state}`,
      );
    }
  }

  console.log(
    "\nStates and scores above were produced by the pipeline, not written by this script.",
  );
  console.log("Classification runs after each response, so scores settle a few seconds later.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
