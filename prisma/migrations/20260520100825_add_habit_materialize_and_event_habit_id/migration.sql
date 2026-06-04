-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "habitId" TEXT;

-- AlterTable
ALTER TABLE "Habit" ADD COLUMN     "materialize" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "Event_habitId_idx" ON "Event"("habitId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
