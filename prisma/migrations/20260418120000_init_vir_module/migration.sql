-- CreateEnum
CREATE TYPE "VirInspectionTypeCategory" AS ENUM ('VETTING', 'PSC', 'CLASS', 'INTERNAL', 'AUDIT');

-- CreateEnum
CREATE TYPE "VirInspectionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'SHORE_REVIEWED', 'CLOSED', 'IMPORT_REVIEW', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "VirQuestionResponseType" AS ENUM ('YES_NO_NA', 'TEXT', 'NUMBER', 'DATE', 'SINGLE_SELECT', 'MULTI_SELECT', 'SCORE');

-- CreateEnum
CREATE TYPE "VirRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "VirFindingType" AS ENUM ('NON_CONFORMITY', 'OBSERVATION', 'RECOMMENDATION', 'POSITIVE');

-- CreateEnum
CREATE TYPE "VirFindingStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'CLOSED', 'CARRIED_OVER');

-- CreateEnum
CREATE TYPE "VirCorrectiveActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VirSignOffStage" AS ENUM ('VESSEL_SUBMISSION', 'SHORE_REVIEW', 'FINAL_ACKNOWLEDGEMENT');

-- CreateEnum
CREATE TYPE "VirImportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'REVIEW', 'READY', 'COMMITTED', 'FAILED');

-- CreateTable
CREATE TABLE "Vessel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imoNumber" TEXT,
    "vesselType" TEXT,
    "fleet" TEXT,
    "flag" TEXT,
    "manager" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Vessel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirInspectionType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "VirInspectionTypeCategory" NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VirInspectionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirTemplate" (
    "id" TEXT NOT NULL,
    "inspectionTypeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VirTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirTemplateSection" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "guidance" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VirTemplateSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirTemplateQuestion" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "responseType" "VirQuestionResponseType" NOT NULL,
    "riskLevel" "VirRiskLevel" NOT NULL DEFAULT 'LOW',
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "allowsObservation" BOOLEAN NOT NULL DEFAULT true,
    "allowsPhoto" BOOLEAN NOT NULL DEFAULT true,
    "isCicCandidate" BOOLEAN NOT NULL DEFAULT false,
    "cicTopic" TEXT,
    "helpText" TEXT,
    "referenceImageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VirTemplateQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirTemplateQuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "score" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "VirTemplateQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirInspection" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT NOT NULL,
    "inspectionTypeId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "externalReference" TEXT,
    "inspectionDate" TIMESTAMP(3) NOT NULL,
    "port" TEXT,
    "country" TEXT,
    "inspectorName" TEXT,
    "inspectorCompany" TEXT,
    "summary" TEXT,
    "status" "VirInspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "previousInspectionId" TEXT,
    "posCount" INTEGER NOT NULL DEFAULT 0,
    "obsCount" INTEGER NOT NULL DEFAULT 0,
    "ncCount" INTEGER NOT NULL DEFAULT 0,
    "recCount" INTEGER NOT NULL DEFAULT 0,
    "shoreReviewedBy" TEXT,
    "shoreReviewDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "importSessionId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VirInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirAnswer" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerText" TEXT,
    "answerNumber" DOUBLE PRECISION,
    "answerBoolean" BOOLEAN,
    "answerDate" TIMESTAMP(3),
    "selectedOptions" JSONB,
    "comment" TEXT,
    "answeredBy" TEXT,
    "answeredAt" TIMESTAMP(3),
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VirAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirFinding" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "questionId" TEXT,
    "findingType" "VirFindingType" NOT NULL,
    "severity" "VirRiskLevel" NOT NULL DEFAULT 'MEDIUM',
    "status" "VirFindingStatus" NOT NULL DEFAULT 'OPEN',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "vesselResponse" TEXT,
    "shoreFeedback" TEXT,
    "isCarriedOver" BOOLEAN NOT NULL DEFAULT false,
    "carriedFromFindingId" TEXT,
    "ownerName" TEXT,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VirFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirPhoto" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT,
    "findingId" TEXT,
    "answerId" TEXT,
    "url" TEXT NOT NULL,
    "storageKey" TEXT,
    "caption" TEXT,
    "fileName" TEXT,
    "contentType" TEXT,
    "fileSizeKb" INTEGER,
    "takenAt" TIMESTAMP(3),
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VirPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirCorrectiveAction" (
    "id" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "actionText" TEXT NOT NULL,
    "ownerName" TEXT,
    "targetDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "VirCorrectiveActionStatus" NOT NULL DEFAULT 'OPEN',
    "completionRemark" TEXT,
    "verificationRemark" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VirCorrectiveAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirSignOff" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "stage" "VirSignOffStage" NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "actorName" TEXT,
    "actorRole" TEXT,
    "comment" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VirSignOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirImportSession" (
    "id" TEXT NOT NULL,
    "vesselId" TEXT,
    "inspectionTypeId" TEXT,
    "sourceFileName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceSystem" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'PDF',
    "status" "VirImportStatus" NOT NULL DEFAULT 'QUEUED',
    "modelName" TEXT DEFAULT 'gpt-4o',
    "extractedAt" TIMESTAMP(3),
    "confidenceAvg" DOUBLE PRECISION,
    "rawTextHash" TEXT,
    "payload" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VirImportSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirImportFieldReview" (
    "id" TEXT NOT NULL,
    "importSessionId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "aiValue" TEXT,
    "finalValue" TEXT,
    "confidence" DOUBLE PRECISION,
    "accepted" BOOLEAN,
    "reviewerName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VirImportFieldReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vessel_code_key" ON "Vessel"("code");
CREATE UNIQUE INDEX "Vessel_imoNumber_key" ON "Vessel"("imoNumber");
CREATE INDEX "Vessel_name_idx" ON "Vessel"("name");
CREATE INDEX "Vessel_fleet_idx" ON "Vessel"("fleet");

CREATE UNIQUE INDEX "VirInspectionType_code_key" ON "VirInspectionType"("code");
CREATE INDEX "VirInspectionType_category_idx" ON "VirInspectionType"("category");
CREATE INDEX "VirInspectionType_name_idx" ON "VirInspectionType"("name");

CREATE UNIQUE INDEX "VirTemplate_inspectionTypeId_version_key" ON "VirTemplate"("inspectionTypeId", "version");
CREATE UNIQUE INDEX "VirTemplateSection_templateId_sortOrder_key" ON "VirTemplateSection"("templateId", "sortOrder");
CREATE UNIQUE INDEX "VirTemplateQuestion_sectionId_code_key" ON "VirTemplateQuestion"("sectionId", "code");
CREATE UNIQUE INDEX "VirTemplateQuestion_sectionId_sortOrder_key" ON "VirTemplateQuestion"("sectionId", "sortOrder");
CREATE UNIQUE INDEX "VirTemplateQuestionOption_questionId_value_key" ON "VirTemplateQuestionOption"("questionId", "value");
CREATE UNIQUE INDEX "VirTemplateQuestionOption_questionId_sortOrder_key" ON "VirTemplateQuestionOption"("questionId", "sortOrder");

CREATE INDEX "VirInspection_vesselId_inspectionDate_idx" ON "VirInspection"("vesselId", "inspectionDate");
CREATE INDEX "VirInspection_inspectionTypeId_inspectionDate_idx" ON "VirInspection"("inspectionTypeId", "inspectionDate");
CREATE INDEX "VirInspection_status_idx" ON "VirInspection"("status");

CREATE UNIQUE INDEX "VirAnswer_inspectionId_questionId_key" ON "VirAnswer"("inspectionId", "questionId");
CREATE INDEX "VirFinding_inspectionId_status_idx" ON "VirFinding"("inspectionId", "status");
CREATE INDEX "VirFinding_findingType_severity_idx" ON "VirFinding"("findingType", "severity");
CREATE INDEX "VirPhoto_inspectionId_idx" ON "VirPhoto"("inspectionId");
CREATE INDEX "VirPhoto_findingId_idx" ON "VirPhoto"("findingId");
CREATE INDEX "VirPhoto_answerId_idx" ON "VirPhoto"("answerId");
CREATE INDEX "VirCorrectiveAction_status_idx" ON "VirCorrectiveAction"("status");
CREATE INDEX "VirCorrectiveAction_targetDate_idx" ON "VirCorrectiveAction"("targetDate");
CREATE INDEX "VirSignOff_inspectionId_stage_idx" ON "VirSignOff"("inspectionId", "stage");
CREATE INDEX "VirImportSession_status_idx" ON "VirImportSession"("status");
CREATE INDEX "VirImportSession_createdAt_idx" ON "VirImportSession"("createdAt");
CREATE INDEX "VirImportFieldReview_importSessionId_fieldPath_idx" ON "VirImportFieldReview"("importSessionId", "fieldPath");

-- AddForeignKey
ALTER TABLE "VirTemplate" ADD CONSTRAINT "VirTemplate_inspectionTypeId_fkey" FOREIGN KEY ("inspectionTypeId") REFERENCES "VirInspectionType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VirTemplateSection" ADD CONSTRAINT "VirTemplateSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "VirTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VirTemplateQuestion" ADD CONSTRAINT "VirTemplateQuestion_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "VirTemplateSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VirTemplateQuestionOption" ADD CONSTRAINT "VirTemplateQuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "VirTemplateQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VirInspection" ADD CONSTRAINT "VirInspection_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VirInspection" ADD CONSTRAINT "VirInspection_inspectionTypeId_fkey" FOREIGN KEY ("inspectionTypeId") REFERENCES "VirInspectionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VirInspection" ADD CONSTRAINT "VirInspection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "VirTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VirInspection" ADD CONSTRAINT "VirInspection_previousInspectionId_fkey" FOREIGN KEY ("previousInspectionId") REFERENCES "VirInspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VirInspection" ADD CONSTRAINT "VirInspection_importSessionId_fkey" FOREIGN KEY ("importSessionId") REFERENCES "VirImportSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VirAnswer" ADD CONSTRAINT "VirAnswer_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "VirInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VirAnswer" ADD CONSTRAINT "VirAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "VirTemplateQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "VirFinding" ADD CONSTRAINT "VirFinding_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "VirInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VirFinding" ADD CONSTRAINT "VirFinding_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "VirTemplateQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VirFinding" ADD CONSTRAINT "VirFinding_carriedFromFindingId_fkey" FOREIGN KEY ("carriedFromFindingId") REFERENCES "VirFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VirPhoto" ADD CONSTRAINT "VirPhoto_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "VirInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VirPhoto" ADD CONSTRAINT "VirPhoto_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "VirFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VirPhoto" ADD CONSTRAINT "VirPhoto_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "VirAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VirCorrectiveAction" ADD CONSTRAINT "VirCorrectiveAction_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "VirFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VirSignOff" ADD CONSTRAINT "VirSignOff_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "VirInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VirImportSession" ADD CONSTRAINT "VirImportSession_vesselId_fkey" FOREIGN KEY ("vesselId") REFERENCES "Vessel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VirImportSession" ADD CONSTRAINT "VirImportSession_inspectionTypeId_fkey" FOREIGN KEY ("inspectionTypeId") REFERENCES "VirInspectionType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VirImportFieldReview" ADD CONSTRAINT "VirImportFieldReview_importSessionId_fkey" FOREIGN KEY ("importSessionId") REFERENCES "VirImportSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
