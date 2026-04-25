-- Add questionnaire library binding to VirTemplate
ALTER TABLE "VirTemplate"
  ADD COLUMN "questionnaireLibraryId" TEXT;

-- Add answer library type binding to VirTemplateQuestion
ALTER TABLE "VirTemplateQuestion"
  ADD COLUMN "answerLibraryTypeId" TEXT;

-- Foreign keys
ALTER TABLE "VirTemplate"
  ADD CONSTRAINT "VirTemplate_questionnaireLibraryId_fkey"
  FOREIGN KEY ("questionnaireLibraryId") REFERENCES "VirLibraryType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VirTemplateQuestion"
  ADD CONSTRAINT "VirTemplateQuestion_answerLibraryTypeId_fkey"
  FOREIGN KEY ("answerLibraryTypeId") REFERENCES "VirLibraryType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "VirTemplate_questionnaireLibraryId_idx" ON "VirTemplate"("questionnaireLibraryId");
CREATE INDEX "VirTemplateQuestion_answerLibraryTypeId_idx" ON "VirTemplateQuestion"("answerLibraryTypeId");
