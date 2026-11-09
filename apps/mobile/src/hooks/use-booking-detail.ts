import { useCallback, useMemo } from 'react'
import { bookingDetailSchema, type BookingDetail } from '../lib/booking-contracts'
import { useMemberResource } from './use-member-resource'

export function useBookingDetail(id: string, enabled: boolean) {
  const schema = useMemo(() => bookingDetailSchema.refine(booking => booking.id === id), [id])
  const resource = useMemberResource(`/bookings/${encodeURIComponent(id)}`, schema, enabled, 15000)
  const replaceBooking = resource.replace
  const replace = useCallback((booking: BookingDetail) => { if (booking.id === id) replaceBooking(booking) }, [id, replaceBooking])
  return { ...resource, replace }
}
