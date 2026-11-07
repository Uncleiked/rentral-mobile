import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { postgresConfig } from './environment/postgres-config'

const prismaClientSingleton = () => {
  const adapter = new PrismaPg(postgresConfig(process.env.DATABASE_URL ?? '', process.env.SUPABASE_DB_CA_CERT_PATH))
  return new PrismaClient({ adapter })
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
