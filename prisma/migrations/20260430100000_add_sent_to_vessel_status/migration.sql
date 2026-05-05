-- Add SENT_TO_VESSEL to VirInspectionStatus enum
ALTER TYPE "VirInspectionStatus" ADD VALUE IF NOT EXISTS 'SENT_TO_VESSEL';
