import { z } from 'zod'

const reservedHandles = new Set(['admin', 'administrator', 'rentral', 'support', 'help', 'system'])
export const USERNAME_HELP = 'Use 3-24 lowercase letters, numbers or underscores.'
export const usernameSchema = z.string({ error: 'Choose a username. ' + USERNAME_HELP }).trim().toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/, USERNAME_HELP)
  .refine(value => !reservedHandles.has(value), 'That username is reserved. Choose another username.')
