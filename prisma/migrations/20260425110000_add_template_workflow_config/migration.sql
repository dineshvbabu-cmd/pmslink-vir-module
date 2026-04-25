-- Add workflow configuration column to VirTemplate
-- Stores per-template sign-off stage labels, descriptions, actor roles, and required flags
ALTER TABLE "VirTemplate" ADD COLUMN "workflowConfig" JSONB;
