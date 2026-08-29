/**
 * Seeds the three roles so the dashboard can be opened straight after setup.
 * Idempotent: re-running only resets these accounts' passwords.
 *
 *   npm run db:seed
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import pg from "pg";
import { PrismaClient } from "../src/generated/prisma/client";

const DEFAULT_PASSWORD = process.env.SEED_PASSWORD ?? "crisislink123";

const ACCOUNTS = [
  { email: "admin@crisislink.local", name: "Admin User", role: "ADMIN" as const },
  { email: "responder@crisislink.local", name: "Responder User", role: "RESPONDER" as const },
  { email: "citizen@crisislink.local", name: "Citizen User", role: "CITIZEN" as const },
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const pool = new pg.Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    for (const account of ACCOUNTS) {
      await prisma.user.upsert({
        where: { email: account.email },
        update: { passwordHash, role: account.role },
        create: { ...account, passwordHash },
      });
      console.log(`  ${account.role.padEnd(9)} ${account.email}`);
    }
    console.log(`\nPassword for all seeded accounts: ${DEFAULT_PASSWORD}`);

    // Resources and shelters are ORGANISATIONAL INVENTORY, not observations.
    // There is no public feed for "where are the district's boats", so unlike
    // incidents these are seeded. A real deployment would have the operating
    // agency enter them. Be explicit about that distinction in the report:
    // no disaster *observation* in this system is ever fabricated.
    const RESOURCES = [
      { type: "BOAT" as const, label: "Flood rescue boat 1", lat: 19.0176, lng: 72.8562, quantity: 2 },
      { type: "AMBULANCE" as const, label: "Ambulance unit A", lat: 19.076, lng: 72.8777, quantity: 1 },
      { type: "RESCUE_TEAM" as const, label: "NDRF team North", lat: 28.6139, lng: 77.209, quantity: 12 },
      { type: "FIRE_ENGINE" as const, label: "Fire tender 4", lat: 28.7041, lng: 77.1025, quantity: 1 },
      { type: "MEDICAL_SUPPLIES" as const, label: "Medical stores depot", lat: 12.9716, lng: 77.5946, quantity: 40 },
      { type: "FOOD_WATER" as const, label: "Relief supplies point", lat: 13.0827, lng: 80.2707, quantity: 500 },
      { type: "HEAVY_EQUIPMENT" as const, label: "Excavator, municipal yard", lat: 22.5726, lng: 88.3639, quantity: 1 },
    ];
    for (const resource of RESOURCES) {
      const existing = await prisma.resource.findFirst({ where: { label: resource.label } });
      if (!existing) await prisma.resource.create({ data: resource });
    }

    const SHELTERS = [
      { name: "Municipal School, Dadar", lat: 19.019, lng: 72.8442, capacity: 250, currentOccupancy: 0 },
      { name: "Community Hall, Andheri", lat: 19.1197, lng: 72.8464, capacity: 400, currentOccupancy: 0 },
      { name: "Govt. Higher Secondary, Chennai", lat: 13.0674, lng: 80.2376, capacity: 300, currentOccupancy: 0 },
      { name: "Town Hall relief centre, Kolkata", lat: 22.5675, lng: 88.3475, capacity: 180, currentOccupancy: 0 },
      { name: "Sports Complex, Delhi", lat: 28.6304, lng: 77.2177, capacity: 600, currentOccupancy: 0 },
    ];
    for (const shelter of SHELTERS) {
      const existing = await prisma.shelter.findFirst({ where: { name: shelter.name } });
      if (!existing) await prisma.shelter.create({ data: shelter });
    }
    console.log(`Seeded ${RESOURCES.length} resources and ${SHELTERS.length} shelters (inventory, not observations)`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
