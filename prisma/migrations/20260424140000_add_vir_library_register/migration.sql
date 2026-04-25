CREATE TYPE "VirLibraryValueKind" AS ENUM ('TEXT', 'NUMBER', 'BOOLEAN', 'REFERENCE');

CREATE TABLE "VirLibraryType" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "valueKind" "VirLibraryValueKind" NOT NULL DEFAULT 'TEXT',
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VirLibraryType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VirLibraryItem" (
  "id" TEXT NOT NULL,
  "libraryTypeId" TEXT NOT NULL,
  "code" TEXT,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "metadata" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VirLibraryItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VirLibraryItemValue" (
  "id" TEXT NOT NULL,
  "libraryItemId" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "label" TEXT,
  "metadata" JSONB,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VirLibraryItemValue_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VirInspection"
  ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedBy" TEXT;

CREATE UNIQUE INDEX "VirLibraryType_code_key" ON "VirLibraryType"("code");
CREATE INDEX "VirLibraryType_name_idx" ON "VirLibraryType"("name");
CREATE INDEX "VirLibraryType_sortOrder_idx" ON "VirLibraryType"("sortOrder");

CREATE INDEX "VirLibraryItem_libraryTypeId_sortOrder_idx" ON "VirLibraryItem"("libraryTypeId", "sortOrder");
CREATE INDEX "VirLibraryItem_label_idx" ON "VirLibraryItem"("label");

CREATE INDEX "VirLibraryItemValue_libraryItemId_sortOrder_idx" ON "VirLibraryItemValue"("libraryItemId", "sortOrder");

CREATE INDEX "VirInspection_isDeleted_idx" ON "VirInspection"("isDeleted");

ALTER TABLE "VirLibraryItem"
  ADD CONSTRAINT "VirLibraryItem_libraryTypeId_fkey"
  FOREIGN KEY ("libraryTypeId") REFERENCES "VirLibraryType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VirLibraryItemValue"
  ADD CONSTRAINT "VirLibraryItemValue_libraryItemId_fkey"
  FOREIGN KEY ("libraryItemId") REFERENCES "VirLibraryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
