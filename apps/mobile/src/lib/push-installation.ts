import { Platform } from 'react-native'
import * as Crypto from 'expo-crypto'
import { sessionStorage } from './session-storage'
import { createPushInstallationStore } from './push-installation-core'
const store = createPushInstallationStore(sessionStorage, Crypto.randomUUID, () => Crypto.getRandomBytesAsync(32))
const native = () => { if (Platform.OS !== 'android' && Platform.OS !== 'ios') throw new Error('Private push installation proof is available only in the native app.') }
export async function loadPushInstallation() { if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null; return store.load() }
export async function ensurePushInstallation() { native(); return store.create() }
export async function resetPushInstallation() { native(); return store.reset() }
