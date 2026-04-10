-- CreateTable
CREATE TABLE "AutomationIntegration" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationIntegration_automationId_provider_key" ON "AutomationIntegration"("automationId", "provider");

-- AddForeignKey
ALTER TABLE "AutomationIntegration" ADD CONSTRAINT "AutomationIntegration_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
