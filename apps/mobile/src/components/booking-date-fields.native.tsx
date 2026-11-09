import { useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import DateTimePicker from '@expo/ui/community/datetime-picker'
import { Button } from './Button'
import { bookingDateTime, localDateInput } from '../lib/booking-input'
import { colors, space } from '../theme'
import type { BookingDateFieldsProps } from './booking-date-fields.types'

export function BookingDateFields(props: BookingDateFieldsProps) {
  const [picker, setPicker] = useState<'date' | 'time' | 'end' | 'end-time' | null>(null)
  const [fallback] = useState(() => new Date(Date.now() + 86400000))
  const [minimum, setMinimum] = useState(() => new Date())
  const isEnd = picker === 'end' || picker === 'end-time'
  const isTime = picker === 'time' || picker === 'end-time'
  const selected = bookingDateTime(isEnd ? props.endDate : props.date, isEnd ? props.endTime : props.time)
  const value = selected ? new Date(selected) : fallback
  function open(next: 'date' | 'time' | 'end' | 'end-time'): void { setMinimum(new Date()); setPicker(next) }
  return <View style={styles.fields}>
    <Button title={`Start date: ${props.date}`} secondary disabled={props.disabled} onPress={() => open('date')} />
    <Button title={`Time: ${props.time}`} secondary disabled={props.disabled} onPress={() => open('time')} />
    {props.showEnd ? <><Button title={`End date: ${props.endDate}`} secondary disabled={props.disabled} onPress={() => open('end')} />
      <Button title={`End time: ${props.endTime}`} secondary disabled={props.disabled} onPress={() => open('end-time')} /></> : null}
    {picker && !props.disabled ? <View>
      <DateTimePicker value={value} mode={isTime ? 'time' : 'date'} presentation={Platform.OS === 'android' ? 'dialog' : 'inline'}
        display={Platform.OS === 'ios' ? 'spinner' : 'default'} is24Hour accentColor={colors.accentBright} themeVariant="dark"
        minimumDate={isTime ? undefined : minimum} onDismiss={() => setPicker(null)}
        onValueChange={(_event, next) => {
          const time = `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`
          if (picker === 'time') props.onTime(time)
          else if (picker === 'end-time') props.onEndTime(time)
          else if (picker === 'end') props.onEndDate(localDateInput(next))
          else props.onDate(localDateInput(next))
          if (Platform.OS === 'android') setPicker(null)
        }} />
      {Platform.OS === 'ios' ? <Button title="Done" secondary onPress={() => setPicker(null)} /> : null}
    </View> : null}
  </View>
}

const styles = StyleSheet.create({ fields: { gap: space.md } })
