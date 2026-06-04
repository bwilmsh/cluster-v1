/*
  Warnings:

  - You are about to drop the `ScheduledTask` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `appointments` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `customers` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `memories` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ScheduledTask" DROP CONSTRAINT "ScheduledTask_agentId_fkey";

-- DropForeignKey
ALTER TABLE "ScheduledTask" DROP CONSTRAINT "ScheduledTask_userId_fkey";

-- DropForeignKey
ALTER TABLE "appointments" DROP CONSTRAINT "appointments_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "memories" DROP CONSTRAINT "memories_customer_id_fkey";

-- DropIndex
DROP INDEX "Automation_agentId_idx";

-- DropIndex
DROP INDEX "Automation_templateId_idx";

-- DropIndex
DROP INDEX "Automation_userId_idx";

-- DropIndex
DROP INDEX "AutomationRun_automationId_idx";

-- DropIndex
DROP INDEX "AutomationTemplate_id_key";

-- DropIndex
DROP INDEX "Workflow_userId_idx";

-- DropIndex
DROP INDEX "WorkflowRun_workflowId_idx";

-- DropTable
DROP TABLE "ScheduledTask";

-- DropTable
DROP TABLE "appointments";

-- DropTable
DROP TABLE "customers";

-- DropTable
DROP TABLE "memories";

-- CreateTable
CREATE TABLE "Habit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rrule" TEXT,
    "cadence" TEXT,
    "timeOfDay" TEXT,
    "timezone" TEXT,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCompleted" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
