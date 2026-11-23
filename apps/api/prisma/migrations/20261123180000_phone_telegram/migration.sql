-- AlterTable
ALTER TABLE "PhoneVerification" ADD COLUMN     "linkHash" TEXT,
ADD COLUMN     "telegramUserId" TEXT,
ALTER COLUMN "codeHash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PhoneVerification_linkHash_key" ON "PhoneVerification"("linkHash");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneVerification_telegramUserId_key" ON "PhoneVerification"("telegramUserId");

