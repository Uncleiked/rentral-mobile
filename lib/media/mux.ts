import Mux from '@mux/mux-node'
import { muxConfigured } from './config'

export function muxClient() {
  if (!muxConfigured()) throw new Error('mux-not-configured')
  return new Mux({
    tokenId: process.env.MUX_TOKEN_ID,
    tokenSecret: process.env.MUX_TOKEN_SECRET,
    webhookSecret: process.env.MUX_WEBHOOK_SECRET,
    timeout: 15000,
    maxRetries: 0,
  })
}
