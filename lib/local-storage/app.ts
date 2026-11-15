import { createLocalStorage, defaultStorageDirectory } from './core'
import { createMongoStorage } from './mongodb'
import { mediaStorageDatabase } from '../database/readiness'
import { StorageError } from './policy'
export type AppStorage = ReturnType<typeof createLocalStorage> & { uploadPart?: ReturnType<typeof createMongoStorage>['uploadPart'] }
export function appStorageDriver(): 'local' | 'mongodb' {
  const configured = process.env.RENTRAL_STORAGE_DRIVER?.trim()
  if (configured && !['local', 'mongodb'].includes(configured)) throw new StorageError(503, 'STORAGE_CONFIGURATION_REQUIRED', 'Choose a supported server storage driver.')
  return configured === 'local' || configured === 'mongodb' ? configured : process.env.VERCEL === '1' ? 'mongodb' : 'local'
}
/** Server-only; no connection or setup occurs until an authorized caller uses it. */
export function createAppStorage(): AppStorage {
  return appStorageDriver() === 'mongodb' ? createMongoStorage(mediaStorageDatabase) : createLocalStorage(defaultStorageDirectory())
}
