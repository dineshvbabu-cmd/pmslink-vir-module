-- Add image URL and metadata to Vessel
ALTER TABLE "Vessel" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "Vessel" ADD COLUMN "metadata" JSONB;
