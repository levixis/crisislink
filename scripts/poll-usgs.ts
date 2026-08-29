/**
 * Runs the USGS ingester once from the command line, so you don't need the dev
 * server up to refresh the map's official incidents.
 *
 *   npm run poll:usgs
 */
import "dotenv/config";
import { pollUsgs } from "../src/lib/feeds/usgs";
import { prisma } from "../src/lib/prisma";

pollUsgs()
  .then((result) => {
    console.log("USGS ingest:", result);
    return prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
