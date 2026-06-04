-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'MAX');

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "plan" "Plan" NOT NULL DEFAULT 'FREE';