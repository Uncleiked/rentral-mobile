import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { createChunkedSessionStorage } from './session-storage-core'

const nativeStorage = createChunkedSessionStorage({
  getItem: key => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  removeItem: key => SecureStore.deleteItemAsync(key),
})

export const sessionStorage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return typeof window === 'undefined' ? null : window.sessionStorage.getItem(key)
    return nativeStorage.getItem(key)
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') { window.sessionStorage.setItem(key, value); return }
    await nativeStorage.setItem(key, value)
  },
  async removeItem(key: string): Promise<void> {
    if (Platform.OS === 'web') { if (typeof window !== 'undefined') window.sessionStorage.removeItem(key); return }
    await nativeStorage.removeItem(key)
  },
}
