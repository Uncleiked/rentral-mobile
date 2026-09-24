import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const count = await prisma.user.count();
  console.log({ userCount: count });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
