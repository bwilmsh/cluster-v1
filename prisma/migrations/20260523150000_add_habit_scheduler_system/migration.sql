-- CreateEnum
CREATE TYPE "HabitFrequency" AS ENUM ('DAILY', 'WEEKDAYS', 'WEEKLY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "HabitIdealTime" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING');

-- CreateEnum
CREATE TYPE "HabitPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "HabitEntryStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'SKIPPED', 'RESCHEDULED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "habitEntryId" TEXT;

-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "autoReschedule" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "daysOfWeek" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "frequency" "HabitFrequency" NOT NULL DEFAULT 'DAILY',
ADD COLUMN     "idealTime" "HabitIdealTime" NOT NULL DEFAULT 'MORNING',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "longestStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "priorityLevel" "HabitPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "streak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timeRangeEnd" TEXT,
ADD COLUMN     "timeRangeStart" TEXT;

-- CreateTable
CREATE TABLE "HabitEntry" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "status" "HabitEntryStatus" NOT NULL DEFAULT 'SCHEDULED',
    "wasRescheduled" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HabitEntry_habitId_scheduledDate_idx" ON "HabitEntry"("habitId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "HabitEntry_habitId_scheduledDate_key" ON "HabitEntry"("habitId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "Event_habitEntryId_key" ON "Event"("habitEntryId");

-- CreateIndex
CREATE INDEX "Event_habitOccurrenceAt_idx" ON "Event"("habitOccurrenceAt");

-- AddForeignKey
ALTER TABLE "HabitEntry" ADD CONSTRAINT "HabitEntry_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_habitEntryId_fkey" FOREIGN KEY ("habitEntryId") REFERENCES "HabitEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
