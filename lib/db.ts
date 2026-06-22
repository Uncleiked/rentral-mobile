import { PrismaClient } from '@prisma/client'
// 1. Uncomment these if you are using the Prisma Postgres Adapter
// import { Pool } from 'pg'
// import { PrismaPg } from '@prisma/adapter-pg'

// 2. Uncomment these to initialize the pool
// const pool = new Pool({ connectionString: process.env.DATABASE_URL })
// const adapter = new PrismaPg(pool)

const prismaClientSingleton = () => {
  return new PrismaClient({
    // adapter, // 3. Uncomment this if using the adapter
  })
}

// Ensure the global instance is strongly typed
declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

// Check if we already have a Prisma instance, otherwise create a new one
const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

// In development, save the instance to the global object so it isn't recreated
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma