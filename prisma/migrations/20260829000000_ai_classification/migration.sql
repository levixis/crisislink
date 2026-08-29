-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "aiClassifiedAt" TIMESTAMP(3),
ADD COLUMN     "aiConfidence" DOUBLE PRECISION,
ADD COLUMN     "aiMatchesType" BOOLEAN,
ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "aiReasoning" TEXT,
ADD COLUMN     "aiSeverity" INTEGER;
