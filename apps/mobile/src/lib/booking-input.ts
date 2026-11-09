export function localDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Validate actual calendar dates before converting the device's local time to ISO. */
export function bookingDateTime(dateText: string, timeText: string): string | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText)
  const time = /^(\d{2}):(\d{2})$/.exec(timeText)
  if (!date || !time) return null
  const year = Number(date[1]), month = Number(date[2]), day = Number(date[3]), hour = Number(time[1]), minute = Number(time[2])
  if (year < 2020 || year > 2200 || hour > 23 || minute > 59) return null
  const result = new Date(year, month - 1, day, hour, minute)
  if (result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day || result.getHours() !== hour || result.getMinutes() !== minute) return null
  return result.toISOString()
}
