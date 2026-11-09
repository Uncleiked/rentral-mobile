export type BookingDateFieldsProps = {
  date: string; time: string; endDate: string; endTime: string; showEnd: boolean; disabled: boolean
  onDate: (value: string) => void; onTime: (value: string) => void; onEndDate: (value: string) => void; onEndTime: (value: string) => void
}
