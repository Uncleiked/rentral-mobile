const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: {
      individualProfile: true,
      organizationProfile: true,
    }
  });
  console.dir(users, { depth: null });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
