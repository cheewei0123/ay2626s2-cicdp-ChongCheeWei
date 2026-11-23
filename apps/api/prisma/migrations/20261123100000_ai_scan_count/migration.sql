-- CreateTable
CREATE TABLE "AiScanCount" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AiScanCount_pkey" PRIMARY KEY ("userId","day")
);

-- AddForeignKey
ALTER TABLE "AiScanCount" ADD CONSTRAINT "AiScanCount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
