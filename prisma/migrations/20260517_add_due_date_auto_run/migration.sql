-- CreateTable DueDateAutoRun
CREATE TABLE "DueDateAutoRun" (
    "id" TEXT NOT NULL,
    "eventId" TEXT,
    "goalId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "actionType" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DueDateAutoRun_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey for Event
ALTER TABLE "DueDateAutoRun" ADD CONSTRAINT "DueDateAutoRun_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey for Goal
ALTER TABLE "DueDateAutoRun" ADD CONSTRAINT "DueDateAutoRun_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex for eventId (unique)
CREATE UNIQUE INDEX "DueDateAutoRun_eventId_key" ON "DueDateAutoRun"("eventId");

-- CreateIndex for goalId (unique)
CREATE UNIQUE INDEX "DueDateAutoRun_goalId_key" ON "DueDateAutoRun"("goalId");
