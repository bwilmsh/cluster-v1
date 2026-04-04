/*
  Warnings:

  - You are about to drop the column `enabled` on the `ScheduledTask` table. All the data in the column will be lost.
  - You are about to drop the column `lastResult` on the `ScheduledTask` table. All the data in the column will be lost.
  - You are about to drop the column `lastRun` on the `ScheduledTask` table. All the data in the column will be lost.
  - You are about to drop the column `nextRun` on the `ScheduledTask` table. All the data in the column will be lost.
  - You are about to drop the column `prompt` on the `ScheduledTask` table. All the data in the column will be lost.
  - Added the required column `description` to the `ScheduledTask` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ScheduledTask" DROP COLUMN "enabled",
DROP COLUMN "lastResult",
DROP COLUMN "lastRun",
DROP COLUMN "nextRun",
DROP COLUMN "prompt",
ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "agentPlan" TEXT,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "lastRunResult" TEXT,
ADD COLUMN     "lastRunStatus" TEXT,
ADD COLUMN     "planApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "resultDelivery" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "websiteUrl" TEXT;

-- CreateTable
CREATE TABLE "TaskResult" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "result" TEXT NOT NULL,

    CONSTRAINT "TaskResult_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TaskResult" ADD CONSTRAINT "TaskResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ScheduledTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
