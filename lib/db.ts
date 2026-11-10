import { Prisma, PrismaClient } from '@prisma/client'
import { assertAppendOnlyOperation, type RelationGraph } from './database/append-only'
import { mongoUrl } from './database/config'
import { assertMongoReady, assertStorageClaimsReady, assertFinancialReady, assertLifecycleReady, assertMutationReady, assertAuthSecurityReady, assertMatchingReady, assertCaptureReady } from './database/readiness'

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
      if (model === 'StorageObject') await assertStorageClaimsReady()
      else if (model === 'ListingCapture') await assertCaptureReady()
      else if (model === 'MutationReceipt') await assertMutationReady()
      else if (model && ['EmailChange', 'AuthEmailDelivery'].includes(model)) await assertAuthSecurityReady()
      else if (model && ['MatchProfile', 'MatchConnection', 'MatchMessage', 'MatchBlock', 'MatchReport'].includes(model)) await assertMatchingReady()
      else if (model && ['PaymentRecipient', 'FinancialOperation', 'FinancialAllocation', 'ProviderReceipt'].includes(model)) await assertFinancialReady()
      else if (model && ['LeaseTermination', 'WorkerState', 'WorkerFailure'].includes(model)) await assertLifecycleReady()
      else await assertMongoReady()
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
