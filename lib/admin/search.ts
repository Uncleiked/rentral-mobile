/** Prisma Mongo string filters use regex patterns; all admin text is literal. */
export function escapeAdminText(value: string): string {
  return value.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')
}
