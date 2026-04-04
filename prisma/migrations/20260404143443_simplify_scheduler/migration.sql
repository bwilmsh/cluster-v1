/*
  Warnings:

  - You are about to drop the column `agentPlan` on the `ScheduledTask` table. All the data in the column will be lost.
  - You are about to drop the column `lastRunStatus` on the `ScheduledTask` table. All the data in the column will be lost.
  - You are about to drop the column `planApproved` on the `ScheduledTask` table. All the data in the column will be lost.
  - You are about to drop the column `resultDelivery` on the `ScheduledTask` table. All the data in the column will be lost.
  - You are about to drop the column `websiteUrl` on the `ScheduledTask` table. All the data in the column will be lost.
  - You are about to drop the `TaskResult` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TaskResult" DROP CONSTRAINT "TaskResult_taskId_fkey";

-- AlterTable
ALTER TABLE "ScheduledTask" DROP COLUMN "agentPlan",
DROP COLUMN "lastRunStatus",
DROP COLUMN "planApproved",
DROP COLUMN "resultDelivery",
DROP COLUMN "websiteUrl",
ALTER COLUMN "active" SET DEFAULT true;

-- DropTable
DROP TABLE "TaskResult";
