-- CreateTable
CREATE TABLE "IndividualProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "date_of_birth" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndividualProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organization_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IndividualProfile_userId_key" ON "IndividualProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationProfile_userId_key" ON "OrganizationProfile"("userId");

-- AddForeignKey
ALTER TABLE "IndividualProfile" ADD CONSTRAINT "IndividualProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationProfile" ADD CONSTRAINT "OrganizationProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
