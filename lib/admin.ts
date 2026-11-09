import { createStorageAdmin } from '@/lib/local-storage/adapter'

// This module depends on node:fs through the local storage adapter and belongs
// exclusively to server services. Route/domain authorization precedes signing.
export function createAdminClient() { return createStorageAdmin() }
