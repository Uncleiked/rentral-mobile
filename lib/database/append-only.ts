const appendOnlyModels = new Set(['LedgerTransaction', 'LedgerEntry', 'AdminAudit', 'HoldCreditAllocation', 'FinancialAllocation', 'MutationReceipt'])
const prohibitedOperations = new Set(['update', 'updateMany', 'updateManyAndReturn', 'delete', 'deleteMany', 'upsert'])
const dataOperations = new Set(['create', 'createMany', 'createManyAndReturn', 'update', 'updateMany', 'updateManyAndReturn', 'upsert'])
export type RelationGraph = Readonly<Record<string, Readonly<Record<string, string>>>>

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function inspectData(model: string, data: unknown, relations: RelationGraph): void {
  if (Array.isArray(data)) { for (const item of data) inspectData(model, item, relations); return }
  if (!record(data)) return
  // Traverse only schema relations. A customer's Json metadata is never interpreted as ORM commands.
  for (const [field, target] of Object.entries(relations[model] ?? {})) {
    const nested = data[field]
    if (!record(nested)) continue
    if (appendOnlyModels.has(target) && Object.keys(nested).some(operation => !['create', 'createMany'].includes(operation))) {
      throw new Error('APPEND_ONLY_RECORD')
    }
    for (const [operation, payload] of Object.entries(nested)) {
      for (const item of Array.isArray(payload) ? payload : [payload]) {
        if (operation === 'create') inspectData(target, item, relations)
        else if (record(item)) {
          if (operation === 'createMany' || operation === 'updateMany') inspectData(target, item.data, relations)
          else if (operation === 'update') inspectData(target, 'data' in item ? item.data : item, relations)
          else if (operation === 'upsert') { inspectData(target, item.create, relations); inspectData(target, item.update, relations) }
          else if (operation === 'connectOrCreate') inspectData(target, item.create, relations)
        }
      }
    }
  }
}

/** Server-client guard. Collection access outside Prisma still requires restricted database credentials. */
export function assertAppendOnlyOperation(model: string, operation: string, args?: unknown, relations: RelationGraph = {}): void {
  if (appendOnlyModels.has(model) && prohibitedOperations.has(operation)) throw new Error('APPEND_ONLY_RECORD')
  if (!dataOperations.has(operation) || !record(args)) return
  if (operation === 'upsert') { inspectData(model, args.create, relations); inspectData(model, args.update, relations) }
  else inspectData(model, args.data, relations)
}
