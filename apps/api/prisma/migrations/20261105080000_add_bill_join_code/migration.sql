-- AlterTable
ALTER TABLE "Bill" ADD COLUMN     "joinCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Bill_joinCode_key" ON "Bill"("joinCode");

