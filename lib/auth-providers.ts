// JWT email/password accounts are local; no external identity provider is offered.
export async function getAuthProviders(): Promise<{ google: boolean; apple: boolean }> {
  return { google: false, apple: false }
}
