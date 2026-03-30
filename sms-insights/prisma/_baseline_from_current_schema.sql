-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "ActionLog" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "userId" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachingAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "coachName" TEXT,
    "clientName" TEXT,
    "callDate" TEXT,
    "score" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "phaseScores" JSONB NOT NULL,
    "strengths" JSONB NOT NULL,
    "improvements" JSONB NOT NULL,
    "redFlags" JSONB NOT NULL,
    "gradingVersion" TEXT NOT NULL DEFAULT 'v1',
    "deterministic" JSONB,
    "criticalBehaviors" JSONB,
    "confidence" INTEGER,
    "qualityGate" JSONB,
    "evidence" JSONB,
    "transcriptHash" TEXT,
    "deidentifiedTranscript" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachingAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDoc" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT,
    "version" TEXT NOT NULL DEFAULT '2026.02',
    "checksum" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "rememberMe" BOOLEAN,
    "sessionId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PLImportBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT,
    "programType" TEXT NOT NULL DEFAULT 'mastermind',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "overallConfidence" INTEGER NOT NULL DEFAULT 0,
    "timelinePayload" JSONB,
    "warningSummary" JSONB,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PLImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PLImportBatchItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "importSessionId" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "periodOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PLImportBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PLImportMapping" (
    "id" TEXT NOT NULL,
    "importSessionId" TEXT NOT NULL,
    "autoMap" JSONB NOT NULL,
    "finalMap" JSONB NOT NULL,
    "mappedInput" JSONB NOT NULL,
    "fieldConfidence" JSONB NOT NULL,
    "manualOverrides" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PLImportMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PLImportParseArtifact" (
    "id" TEXT NOT NULL,
    "importSessionId" TEXT NOT NULL,
    "rawExtraction" JSONB NOT NULL,
    "qualitySignals" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PLImportParseArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PLImportSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'uploaded',
    "sourceType" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "parserVersion" TEXT,
    "mappingVersion" TEXT,
    "overallConfidence" INTEGER NOT NULL DEFAULT 0,
    "requiredFieldsComplete" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PLImportSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PLImportSourceFile" (
    "id" TEXT NOT NULL,
    "importSessionId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "isCompressed" BOOLEAN NOT NULL DEFAULT false,
    "compression" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PLImportSourceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdfExport" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "coachingAnalysisId" TEXT,
    "sessionId" TEXT,
    "coachName" TEXT,
    "clientName" TEXT,
    "callDate" TEXT,
    "score" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PdfExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'coach',
    "teamSection" TEXT,
    "title" TEXT,
    "bio" TEXT,
    "imageUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "onboardingTourVersion" TEXT,
    "onboardingTourCompletedAt" TIMESTAMP(3),
    "onboardingToolIntros" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'video/mp4',
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoomConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "zoomUserId" TEXT NOT NULL,
    "zoomAccountId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL DEFAULT 'bearer',
    "scope" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoomConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoomIngestJob" (
    "id" TEXT NOT NULL,
    "zoomRecordingId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "payload" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoomIngestJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZoomRecording" (
    "id" TEXT NOT NULL,
    "zoomConnectionId" TEXT,
    "coachingAnalysisId" TEXT,
    "zoomMeetingUuid" TEXT NOT NULL,
    "zoomMeetingId" TEXT,
    "zoomRecordingId" TEXT,
    "zoomFileId" TEXT,
    "zoomUserId" TEXT,
    "hostEmail" TEXT,
    "topic" TEXT,
    "recordingType" TEXT,
    "fileType" TEXT,
    "fileExtension" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "transcriptStatus" TEXT NOT NULL DEFAULT 'pending',
    "deleteStatus" TEXT NOT NULL DEFAULT 'pending',
    "sourcePayload" JSONB,
    "transcriptText" TEXT,
    "transcriptHash" TEXT,
    "downloadUrl" TEXT,
    "recordingStartAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "deleteRequestedAt" TIMESTAMP(3),
    "deleteConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZoomRecording_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActionLog_actionType_idx" ON "ActionLog"("actionType");

-- CreateIndex
CREATE INDEX "ActionLog_createdAt_idx" ON "ActionLog"("createdAt");

-- CreateIndex
CREATE INDEX "ActionLog_userId_idx" ON "ActionLog"("userId");

-- CreateIndex
CREATE INDEX "CoachingAnalysis_createdAt_idx" ON "CoachingAnalysis"("createdAt");

-- CreateIndex
CREATE INDEX "CoachingAnalysis_userId_idx" ON "CoachingAnalysis"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeDoc_slug_key" ON "KnowledgeDoc"("slug");

-- CreateIndex
CREATE INDEX "KnowledgeDoc_category_idx" ON "KnowledgeDoc"("category");

-- CreateIndex
CREATE INDEX "LoginEvent_createdAt_idx" ON "LoginEvent"("createdAt");

-- CreateIndex
CREATE INDEX "LoginEvent_success_idx" ON "LoginEvent"("success");

-- CreateIndex
CREATE INDEX "LoginEvent_userId_idx" ON "LoginEvent"("userId");

-- CreateIndex
CREATE INDEX "PLImportBatch_createdAt_idx" ON "PLImportBatch"("createdAt");

-- CreateIndex
CREATE INDEX "PLImportBatch_status_idx" ON "PLImportBatch"("status");

-- CreateIndex
CREATE INDEX "PLImportBatch_userId_idx" ON "PLImportBatch"("userId");

-- CreateIndex
CREATE INDEX "PLImportBatchItem_importSessionId_idx" ON "PLImportBatchItem"("importSessionId");

-- CreateIndex
CREATE INDEX "PLImportBatchItem_periodLabel_idx" ON "PLImportBatchItem"("periodLabel");

-- CreateIndex
CREATE UNIQUE INDEX "PLImportBatchItem_batchId_importSessionId_key" ON "PLImportBatchItem"("batchId", "importSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PLImportBatchItem_batchId_periodOrder_key" ON "PLImportBatchItem"("batchId", "periodOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PLImportMapping_importSessionId_key" ON "PLImportMapping"("importSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PLImportParseArtifact_importSessionId_key" ON "PLImportParseArtifact"("importSessionId");

-- CreateIndex
CREATE INDEX "PLImportSession_createdAt_idx" ON "PLImportSession"("createdAt");

-- CreateIndex
CREATE INDEX "PLImportSession_status_idx" ON "PLImportSession"("status");

-- CreateIndex
CREATE INDEX "PLImportSession_userId_idx" ON "PLImportSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PLImportSourceFile_importSessionId_key" ON "PLImportSourceFile"("importSessionId");

-- CreateIndex
CREATE INDEX "PLImportSourceFile_createdAt_idx" ON "PLImportSourceFile"("createdAt");

-- CreateIndex
CREATE INDEX "PdfExport_coachingAnalysisId_idx" ON "PdfExport"("coachingAnalysisId");

-- CreateIndex
CREATE INDEX "PdfExport_createdAt_idx" ON "PdfExport"("createdAt");

-- CreateIndex
CREATE INDEX "PdfExport_userId_idx" ON "PdfExport"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Video_name_key" ON "Video"("name");

-- CreateIndex
CREATE INDEX "ZoomConnection_expiresAt_idx" ON "ZoomConnection"("expiresAt");

-- CreateIndex
CREATE INDEX "ZoomConnection_userId_idx" ON "ZoomConnection"("userId");

-- CreateIndex
CREATE INDEX "ZoomConnection_zoomAccountId_idx" ON "ZoomConnection"("zoomAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ZoomConnection_zoomUserId_zoomAccountId_key" ON "ZoomConnection"("zoomUserId", "zoomAccountId");

-- CreateIndex
CREATE INDEX "ZoomIngestJob_createdAt_idx" ON "ZoomIngestJob"("createdAt");

-- CreateIndex
CREATE INDEX "ZoomIngestJob_status_idx" ON "ZoomIngestJob"("status");

-- CreateIndex
CREATE INDEX "ZoomIngestJob_zoomRecordingId_idx" ON "ZoomIngestJob"("zoomRecordingId");

-- CreateIndex
CREATE INDEX "ZoomRecording_coachingAnalysisId_idx" ON "ZoomRecording"("coachingAnalysisId");

-- CreateIndex
CREATE INDEX "ZoomRecording_recordingStartAt_idx" ON "ZoomRecording"("recordingStartAt");

-- CreateIndex
CREATE INDEX "ZoomRecording_status_idx" ON "ZoomRecording"("status");

-- CreateIndex
CREATE INDEX "ZoomRecording_zoomConnectionId_idx" ON "ZoomRecording"("zoomConnectionId");

-- CreateIndex
CREATE INDEX "ZoomRecording_zoomUserId_idx" ON "ZoomRecording"("zoomUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ZoomRecording_zoomMeetingUuid_zoomFileId_key" ON "ZoomRecording"("zoomMeetingUuid", "zoomFileId");

-- AddForeignKey
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachingAnalysis" ADD CONSTRAINT "CoachingAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginEvent" ADD CONSTRAINT "LoginEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLImportBatch" ADD CONSTRAINT "PLImportBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLImportBatchItem" ADD CONSTRAINT "PLImportBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PLImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLImportBatchItem" ADD CONSTRAINT "PLImportBatchItem_importSessionId_fkey" FOREIGN KEY ("importSessionId") REFERENCES "PLImportSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLImportMapping" ADD CONSTRAINT "PLImportMapping_importSessionId_fkey" FOREIGN KEY ("importSessionId") REFERENCES "PLImportSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLImportParseArtifact" ADD CONSTRAINT "PLImportParseArtifact_importSessionId_fkey" FOREIGN KEY ("importSessionId") REFERENCES "PLImportSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLImportSession" ADD CONSTRAINT "PLImportSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PLImportSourceFile" ADD CONSTRAINT "PLImportSourceFile_importSessionId_fkey" FOREIGN KEY ("importSessionId") REFERENCES "PLImportSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfExport" ADD CONSTRAINT "PdfExport_coachingAnalysisId_fkey" FOREIGN KEY ("coachingAnalysisId") REFERENCES "CoachingAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdfExport" ADD CONSTRAINT "PdfExport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoomConnection" ADD CONSTRAINT "ZoomConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoomIngestJob" ADD CONSTRAINT "ZoomIngestJob_zoomRecordingId_fkey" FOREIGN KEY ("zoomRecordingId") REFERENCES "ZoomRecording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoomRecording" ADD CONSTRAINT "ZoomRecording_coachingAnalysisId_fkey" FOREIGN KEY ("coachingAnalysisId") REFERENCES "CoachingAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZoomRecording" ADD CONSTRAINT "ZoomRecording_zoomConnectionId_fkey" FOREIGN KEY ("zoomConnectionId") REFERENCES "ZoomConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

