import { Prisma, PrismaClient } from '@prisma/client'
import { assertAppendOnlyOperation, type RelationGraph } from './database/append-only'
import { mongoUrl } from './database/config'
import { assertMongoReady } from './database/readiness'

const modelNames = new Set<string>(Prisma.dmmf.datamodel.models.map(model => model.name))
const relations: RelationGraph = Object.fromEntries(Prisma.dmmf.datamodel.models.map(model => [
  model.name, Object.fromEntries(model.fields.filter(field => field.kind === 'object' && modelNames.has(field.type)).map(field => [field.name, field.type])),
]))

const prismaClientSingleton = () => new PrismaClient({
  datasources: { db: { url: mongoUrl(process.env.MONGODB_URL ?? process.env.DATABASE_URL) } },
}).$extends({
  query: {
    async $allOperations({ model, operation, args, query }) {
      if (model) assertAppendOnlyOperation(model, operation, args, relations)
      await assertMongoReady()
      return query(args)
    },
  },
})

declare const globalThis: {
  prismaMongoGlobal: ReturnType<typeof prismaClientSingleton> | undefined
} & typeof global

const prisma = globalThis.prismaMongoGlobal ?? prismaClientSingleton()
if (process.env.NODE_ENV !== 'production') globalThis.prismaMongoGlobal = prisma

export default prisma
