import { StyleSheet, Switch, Text, View } from 'react-native'
import { ChoiceChips } from './ChoiceChips'
import { Field } from './Field'
import type { ListingCategory, ListingForm } from '../lib/native-listing'
import { colors, fonts, space } from '../theme'

type Props = { category: ListingCategory; value: ListingForm; onChange: (form: ListingForm) => void; disabled: boolean }

export function NativeListingFields({ category, value, onChange, disabled }: Props) {
  function change<K extends keyof ListingForm>(key: K, next: ListingForm[K]): void { onChange({ ...value, [key]: next }) }
  function numeric(key: 'bedrooms' | 'bathrooms' | 'sizeSqm' | 'mileageKm' | 'seats' | 'capacityPersons', label: string) {
    return <Field label={label} value={value[key]} onChangeText={text => change(key, text.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={9} editable={!disabled} />
  }
  return <View style={styles.fields}>
    <Field label="Listing title (optional)" value={value.listingTitle} onChangeText={text => change('listingTitle', text)} maxLength={100} editable={!disabled} />
    <Field label="Full listing address" value={value.address} onChangeText={text => change('address', text)} maxLength={300} editable={!disabled} placeholder="Street, neighbourhood, city and state" />
    <Text style={styles.help}>The public feed shows the neighbourhood. Your complete address stays private.</Text>
    <Field label="Base price (NGN)" value={value.basePrice} onChangeText={text => change('basePrice', text.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={10} editable={!disabled} placeholder="Whole naira, for example 250000" />
    <ChoiceChips label="Price period" value={value.pricePeriod} options={[{ value: 'year', label: 'Per year' }, { value: 'month', label: 'Per month' }, { value: 'day', label: 'Per day' }, { value: 'trip', label: 'Per trip' }]} onChange={next => change('pricePeriod', next)} disabled={disabled} />
    {category === 'house' ? <>{numeric('bedrooms', 'Bedrooms (0 for a studio)')}{numeric('bathrooms', 'Bathrooms')}{numeric('sizeSqm', 'Size in square metres')}
      <Field label="Amenities (optional)" value={value.amenities} onChangeText={text => change('amenities', text)} maxLength={280} editable={!disabled} />
    </> : category === 'car' ? <>
      <ChoiceChips label="Transmission" value={value.transmission} options={[{ value: 'automatic', label: 'Automatic' }, { value: 'manual', label: 'Manual' }]} onChange={next => change('transmission', next)} disabled={disabled} />
      {numeric('mileageKm', 'Mileage in kilometres')}{numeric('seats', 'Seats')}<Field label="Fuel type" value={value.fuelType} onChangeText={text => change('fuelType', text)} maxLength={80} editable={!disabled} placeholder="Petrol, diesel, electric…" />
    </> : <><Field label="Vessel type" value={value.vesselType} onChangeText={text => change('vesselType', text)} maxLength={80} editable={!disabled} placeholder="Speedboat, yacht…" />{numeric('capacityPersons', 'Guest capacity')}
      <View style={styles.toggle}><Text style={styles.label}>Captain included</Text><Switch accessibilityLabel="Captain included" value={value.hasCaptain} onValueChange={next => change('hasCaptain', next)} disabled={disabled} trackColor={{ false: colors.border, true: colors.accent }} thumbColor={colors.text} /></View>
    </>}
    <Field label="Description (optional)" value={value.description} onChangeText={text => change('description', text)} multiline maxLength={1500} editable={!disabled} />
  </View>
}

const styles = StyleSheet.create({ fields: { gap: space.lg }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 20 }, toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.lg }, label: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 13 } })
