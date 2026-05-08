-- Add PENDING_APPROVAL to VirInspectionStatus enum
ALTER TYPE "VirInspectionStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';

-- Create VirPmsDefectStatus enum
DO $$ BEGIN
  CREATE TYPE "VirPmsDefectStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create VirPmsDefect table
CREATE TABLE IF NOT EXISTS "VirPmsDefect" (
  "id"                 TEXT NOT NULL,
  "correctiveActionId" TEXT NOT NULL,
  "findingId"          TEXT NOT NULL,
  "inspectionId"       TEXT NOT NULL,
  "defectRef"          TEXT NOT NULL,
  "title"              TEXT NOT NULL,
  "description"        TEXT NOT NULL,
  "status"             "VirPmsDefectStatus" NOT NULL DEFAULT 'OPEN',
  "raisedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "raisedBy"           TEXT,
  "closedAt"           TIMESTAMP(3),
  "closedBy"           TEXT,
  "remarks"            TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VirPmsDefect_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on correctiveActionId (one defect per CA)
CREATE UNIQUE INDEX IF NOT EXISTS "VirPmsDefect_correctiveActionId_key" ON "VirPmsDefect"("correctiveActionId");

-- Indexes
CREATE INDEX IF NOT EXISTS "VirPmsDefect_inspectionId_idx" ON "VirPmsDefect"("inspectionId");
CREATE INDEX IF NOT EXISTS "VirPmsDefect_findingId_idx"    ON "VirPmsDefect"("findingId");
CREATE INDEX IF NOT EXISTS "VirPmsDefect_status_idx"       ON "VirPmsDefect"("status");

-- Foreign keys
ALTER TABLE "VirPmsDefect" ADD CONSTRAINT "VirPmsDefect_correctiveActionId_fkey"
  FOREIGN KEY ("correctiveActionId") REFERENCES "VirCorrectiveAction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VirPmsDefect" ADD CONSTRAINT "VirPmsDefect_findingId_fkey"
  FOREIGN KEY ("findingId") REFERENCES "VirFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VirPmsDefect" ADD CONSTRAINT "VirPmsDefect_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "VirInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
