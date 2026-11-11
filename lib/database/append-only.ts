const appendOnlyModels = new Set(['LedgerTransaction', 'LedgerEntry', 'AdminAudit', 'HoldCreditAllocation', 'FinancialAllocation', 'MutationReceipt', 'GoogleIdentity'])
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
  // A Google credential refresh may only CAS the credential fingerprint. Provider
  // subject/account bindings stay immutable, including through nested relations.
  if (model === 'GoogleIdentity' && operation === 'updateMany') {
    if (!record(args) || !record(args.where) || !record(args.data) || Object.keys(args.where).sort().join(',') !== 'credential_fingerprint,id,user_id' || Object.keys(args.data).join(',') !== 'credential_fingerprint' || ![args.where.id, args.where.user_id].every(value => typeof value === 'string' && value.length > 0) || ![args.where.credential_fingerprint, args.data.credential_fingerprint].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) throw new Error('APPEND_ONLY_RECORD')
    return
  }
  if (appendOnlyModels.has(model) && prohibitedOperations.has(operation)) throw new Error('APPEND_ONLY_RECORD')
  if (model === 'StorageObject' && ['update', 'updateMany'].includes(operation) && record(args) && record(args.data) && 'upload_completed_at' in args.data &&
    (!record(args.where) || args.where.state !== 'uploading' || typeof args.where.operation_token !== 'string' || args.data.state !== 'available')) throw new Error('IMMUTABLE_UPLOAD_PROVENANCE')
  if (model === 'ListingCapture' && prohibitedOperations.has(operation)) {
    if (['delete', 'deleteMany', 'upsert'].includes(operation) || !record(args) || !record(args.data) || !record(args.where)) throw new Error('IMMUTABLE_CAPTURE')
    const data = args.data, where = args.where
    const immutable = ['id', 'owner_id', 'session_id', 'begin_hash', 'start_geometry', 'start_accuracy', 'start_sample_at', 'started_at', 'finish_by']
    if (immutable.some(field => field in data)) throw new Error('IMMUTABLE_CAPTURE')
    const endFields = ['finish_hash', 'end_geometry', 'end_accuracy', 'end_sample_at', 'finished_at', 'seal_by', 'duration_seconds']
    const videoFields = ['video_path', 'video_object_id', 'video_digest', 'sealed_at']
    if (endFields.some(field => field in data) && (where.state !== 'recording' || data.state !== 'recorded')) throw new Error('IMMUTABLE_CAPTURE')
    if (videoFields.some(field => field in data) && (where.state !== 'recorded' || data.state !== 'sealed')) throw new Error('IMMUTABLE_CAPTURE')
    if ('state' in data && !((where.state === 'recording' && data.state === 'recorded') || (where.state === 'recorded' && data.state === 'sealed'))) throw new Error('IMMUTABLE_CAPTURE')
    if ('listing_id' in data && where.state !== 'sealed') throw new Error('IMMUTABLE_CAPTURE')
  }
  if (!dataOperations.has(operation) || !record(args)) return
  if (operation === 'upsert') { inspectData(model, args.create, relations); inspectData(model, args.update, relations) }
  else inspectData(model, args.data, relations)
}
