import { StyleSheet, Text, View } from 'react-native'
import { Host, Picker, Switch } from '@expo/ui'
import { ChoiceChips } from './ChoiceChips'
import { Field } from './Field'
import type { ListingCategory, ListingForm } from '../lib/native-listing'
import { colors, fonts, space } from '../theme'

type Props = { category: ListingCategory; value: ListingForm; onChange: (form: ListingForm) => void; disabled: boolean }

export function NativeListingFields({ category, value, onChange, disabled }: Props) {
  function change<K extends keyof ListingForm>(key: K, next: ListingForm[K]): void { onChange({ ...value, [key]: next }) }
  function numeric(key: 'bedrooms' | 'bathrooms' | 'sizeSqm' | 'mileageKm' | 'seats' | 'capacityPersons' | 'kitchens' | 'floors', label: string) {
    return <Field label={label} value={value[key]} onChangeText={text => change(key, text.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={9} editable={!disabled} />
  }
  return <View style={styles.fields}>
    <Field label="Listing title (optional)" value={value.listingTitle} onChangeText={text => change('listingTitle', text)} maxLength={100} editable={!disabled} />
    <ChoiceChips label="Listing purpose" value={value.rentalIntent} options={[{ value: 'rent', label: 'Rent' }, { value: 'buy', label: 'Buy' }, { value: 'squat', label: 'Shared home' }, { value: 'shortlet', label: 'Short let' }]} onChange={next => change('rentalIntent', next)} disabled={disabled} />
    <ChoiceChips label="Your listing capacity" value={value.hostCapacity} options={[{ value: 'owner', label: 'Owner' }, { value: 'agent', label: 'Agent' }, { value: 'tenant', label: 'Tenant' }, { value: 'organization', label: 'Organization' }]} onChange={next => change('hostCapacity', next)} disabled={disabled} />
    <Field label="Full listing address" value={value.address} onChangeText={text => change('address', text)} maxLength={300} editable={!disabled} placeholder="Street, neighbourhood, city and state" />
    <Text style={styles.help}>The public feed shows the neighbourhood. Your complete address stays private.</Text>
    <Field label="State (optional)" value={value.state} onChangeText={text => change('state', text)} maxLength={80} editable={!disabled} />
    <Field label="Neighbourhood (optional)" value={value.neighborhood} onChangeText={text => change('neighborhood', text)} maxLength={80} editable={!disabled} />
    <Field label="Base price (NGN)" value={value.basePrice} onChangeText={text => change('basePrice', text.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={10} editable={!disabled} placeholder="Whole naira, for example 250000" />
    <ChoiceChips label="Price period" value={value.pricePeriod} options={[{ value: 'year', label: 'Per year' }, { value: 'month', label: 'Per month' }, { value: 'day', label: 'Per day' }, { value: 'trip', label: 'Per trip' }]} onChange={next => change('pricePeriod', next)} disabled={disabled} />
    {category === 'house' ? <><Text style={styles.label}>Property type</Text><Host matchContents colorScheme="dark" seedColor={colors.accentBright}><Picker selectedValue={value.propertyType} onValueChange={next => change('propertyType', next)} enabled={!disabled} testID="listing-property-type">{[['','Not provided'],['apartment','Apartment'],['studio','Studio'],['room','Room'],['bungalow','Bungalow'],['duplex','Duplex'],['terrace','Terrace'],['detached','Detached'],['semi-detached','Semi-detached'],['other','Other']].map(([key,label]) => <Picker.Item key={key} value={key} label={label} />)}</Picker></Host>{numeric('bedrooms', 'Bedrooms (0 for a studio)')}{numeric('bathrooms', 'Bathrooms')}{numeric('sizeSqm', 'Size in square metres')}{numeric('kitchens', 'Kitchens (optional)')}{numeric('floors', 'Floors (optional)')}
      <Field label="Amenities (optional)" value={value.amenities} onChangeText={text => change('amenities', text)} maxLength={280} editable={!disabled} />
      <Field label="Household preferences (optional)" value={value.landlordPreferences} onChangeText={text => change('landlordPreferences', text)} multiline maxLength={800} editable={!disabled} placeholder="Describe relevant household arrangements and shared facilities." />
    </> : category === 'car' ? <>
      <ChoiceChips label="Transmission" value={value.transmission} options={[{ value: 'automatic', label: 'Automatic' }, { value: 'manual', label: 'Manual' }]} onChange={next => change('transmission', next)} disabled={disabled} />
      {numeric('mileageKm', 'Mileage in kilometres')}{numeric('seats', 'Seats')}<Field label="Fuel type" value={value.fuelType} onChangeText={text => change('fuelType', text)} maxLength={80} editable={!disabled} placeholder="Petrol, diesel, electric…" />
      <Field label="Body type (optional)" value={value.bodyType} onChangeText={text => change('bodyType', text)} maxLength={60} editable={!disabled} /><Field label="Engine type (optional)" value={value.engineType} onChangeText={text => change('engineType', text)} maxLength={80} editable={!disabled} />
      <ChoiceChips label="Insurance information" value={value.insuranceStatus} options={[{value:'',label:'Not provided'},{value:'insured',label:'Insured'},{value:'not-insured',label:'Not insured'}]} onChange={next => change('insuranceStatus', next)} disabled={disabled} />
      <Field label="Insurance details (optional)" value={value.insuranceDetails} onChangeText={text => change('insuranceDetails', text)} maxLength={300} editable={!disabled} />
    </> : <><Field label="Vessel type" value={value.vesselType} onChangeText={text => change('vesselType', text)} maxLength={80} editable={!disabled} placeholder="Speedboat, yacht…" />{numeric('capacityPersons', 'Guest capacity')}
      <Host matchContents colorScheme="dark" seedColor={colors.accentBright}><Switch label="Captain included" value={value.hasCaptain} onValueChange={next => change('hasCaptain', next)} disabled={disabled} /><Switch label="Life jackets available" value={value.lifeJackets} onValueChange={next => change('lifeJackets', next)} disabled={disabled} /></Host>
      <Field label="Safety equipment (optional)" value={value.safetyEquipment} onChangeText={text => change('safetyEquipment', text)} maxLength={300} editable={!disabled} />
    </>}
    <Field label="Description (optional)" value={value.description} onChangeText={text => change('description', text)} multiline maxLength={1500} editable={!disabled} />
    <Text style={styles.label}>Optional fees in naira</Text><Text style={styles.help}>Enter actual disclosed amounts, with up to two decimal places. Leave unused fees blank. The booking quote checks these fees on the server.</Text>
    {([['agencyFee','Agency fee'],['legalFee','Legal fee'],['cautionFee','Caution deposit'],['serviceCharge','Service charge']] as const).map(([key,label]) => <Field key={key} label={`${label} (optional)`} value={value[key]} onChangeText={text => change(key,text)} keyboardType="decimal-pad" inputMode="decimal" maxLength={13} editable={!disabled} />)}
  </View>
}

const styles = StyleSheet.create({ fields: { gap: space.lg }, help: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, lineHeight: 20 }, toggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.lg }, label: { color: colors.secondary, fontFamily: fonts.medium, fontSize: 13 } })
