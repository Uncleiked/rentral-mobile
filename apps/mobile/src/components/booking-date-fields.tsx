import { Field } from './Field'
import type { BookingDateFieldsProps } from './booking-date-fields.types'

/** Text controls keep the web preview usable; native uses platform date pickers. */
export function BookingDateFields(props: BookingDateFieldsProps) {
  return <>
    <Field label="Start date (YYYY-MM-DD)" value={props.date} onChangeText={props.onDate} placeholder="2026-12-01" editable={!props.disabled} />
    <Field label="Time on this device (HH:MM, 24 hour)" value={props.time} onChangeText={props.onTime} placeholder="10:00" editable={!props.disabled} />
    {props.showEnd ? <><Field label="End date (YYYY-MM-DD)" value={props.endDate} onChangeText={props.onEndDate} editable={!props.disabled} />
      <Field label="End time on this device (HH:MM, 24 hour)" value={props.endTime} onChangeText={props.onEndTime} editable={!props.disabled} /></> : null}
  </>
}
