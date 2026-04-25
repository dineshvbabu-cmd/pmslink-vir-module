-- Add condition score to VirInspection
-- Calculated from scored answers (option scores, library item scores) when answers are saved
ALTER TABLE "VirInspection" ADD COLUMN "conditionScore" DOUBLE PRECISION;
