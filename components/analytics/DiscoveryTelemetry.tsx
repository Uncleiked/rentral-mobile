'use client'

import { useEffect } from 'react'
import { recordInsightAction } from '@/app/actions/analyticsActions'

type Props = { category: 'house' | 'car' | 'boat'; intent: 'rent' | 'buy' | 'squat' | 'shortlet'; neighborhood: string; bedrooms?: number; budgetBand: string }
export function DiscoveryTelemetry(props: Props) {
  const { category, intent, neighborhood, bedrooms, budgetBand } = props
  useEffect(() => {
    // Telemetry failure never blocks discovery. Server validates consent and fields.
    void recordInsightAction({ event: 'search', category, intent, neighborhood, bedrooms, budgetBand }).catch(() => undefined)
  }, [category, intent, neighborhood, bedrooms, budgetBand])
  return null
}
