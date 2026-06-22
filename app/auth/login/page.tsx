import AuthForm from './AuthForm'
import { Suspense } from 'react'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background-app flex flex-col items-center justify-center p-4">
      <Suspense fallback={null}>
        <AuthForm />
      </Suspense>
    </div>
  )
}
