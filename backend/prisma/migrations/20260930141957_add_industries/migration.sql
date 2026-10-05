-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "industryId" TEXT;

-- CreateTable
CREATE TABLE "industries" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "industries_name_key" ON "industries"("name");

-- CreateIndex
CREATE UNIQUE INDEX "industries_slug_key" ON "industries"("slug");

-- CreateIndex
CREATE INDEX "industries_isActive_sortOrder_idx" ON "industries"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "leads_industryId_idx" ON "leads"("industryId");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_industryId_fkey" FOREIGN KEY ("industryId") REFERENCES "industries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
