import { Redirect } from 'expo-router'
import { useAuth } from '../src/providers/AuthProvider'

export default function Entry() {
  const { session } = useAuth()
  return <Redirect href={session ? '/(tabs)/explore' : '/(auth)/sign-in'} />
}
