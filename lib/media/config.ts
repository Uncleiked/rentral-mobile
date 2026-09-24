export function muxEnabled(): boolean {
  return process.env.MUX_ENABLED === 'true'
}

export function muxConfigured(): boolean {
  return ['MUX_TOKEN_ID', 'MUX_TOKEN_SECRET', 'MUX_WEBHOOK_SECRET', 'MUX_SIGNING_KEY_ID', 'MUX_SIGNING_PRIVATE_KEY']
    .every(key => Boolean(process.env[key]?.trim()))
}
