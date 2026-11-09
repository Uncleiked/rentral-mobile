import {StyleSheet,Text,View}from'react-native'
import{Host,Picker}from'@expo/ui'
import{Field}from'./Field'
import{ChoiceChips}from'./ChoiceChips'
import{discoveryCategoryChange,type DiscoveryFilters}from'../lib/discovery-input'
import{colors,fonts,space}from'../theme'
export function DiscoveryFilterFields({value,onChange}:{value:DiscoveryFilters;onChange:(next:DiscoveryFilters)=>void}){
 const change=<K extends keyof DiscoveryFilters>(key:K,next:DiscoveryFilters[K])=>onChange({...value,[key]:next,cursor:null})
 const count=(key:'bedrooms'|'bathrooms'|'kitchens'|'seats'|'capacityPersons',label:string)=><Field label={label} value={value[key]} onChangeText={text=>change(key,text.replace(/\D/g,''))} keyboardType="number-pad" inputMode="numeric" maxLength={3} placeholder="Any"/>
 return <View style={styles.fields}>
  <ChoiceChips label="Asset category" value={value.category} options={[{value:'all',label:'All'},{value:'house',label:'Homes'},{value:'car',label:'Cars'},{value:'boat',label:'Boats'}]} onChange={category=>onChange(discoveryCategoryChange(value,category))}/>
  <Field label="Location keywords" value={value.q} onChangeText={text=>change('q',text)} maxLength={100} placeholder="Lekki, Yaba, Ikoyi…"/>
  <Field label="State (optional)" value={value.state} onChangeText={text=>change('state',text)} maxLength={50} placeholder="Lagos"/>
  <ChoiceChips label="Listing purpose" value={value.intent} options={[{value:'',label:'Any'},{value:'rent',label:'Rent'},{value:'buy',label:'Buy'},{value:'squat',label:'Shared home'},{value:'shortlet',label:'Short let'}]} onChange={next=>change('intent',next)}/>
  <Text style={styles.help}>Budget applies to each listing’s stated price period. Counts below are exact matches.</Text>
  <Field label="Minimum budget in naira" value={value.minPrice} onChangeText={text=>change('minPrice',text)} keyboardType="decimal-pad" inputMode="decimal" maxLength={13} placeholder="No minimum"/>
  <Field label="Maximum budget in naira" value={value.maxPrice} onChangeText={text=>change('maxPrice',text)} keyboardType="decimal-pad" inputMode="decimal" maxLength={13} placeholder="No maximum"/>
  {value.category==='house'?<>{count('bedrooms','Bedrooms (exact count, 0 for studio)')}{count('bathrooms','Bathrooms (exact count)')}{count('kitchens','Kitchens (exact count)')}</>:value.category==='car'?<>
   <Text style={styles.help}>Transmission</Text><Host matchContents colorScheme="dark" seedColor={colors.accentBright}><Picker selectedValue={value.transmission} onValueChange={next=>change('transmission',next)} testID="discovery-transmission"><Picker.Item value="" label="Any transmission"/><Picker.Item value="automatic" label="Automatic"/><Picker.Item value="manual" label="Manual"/></Picker></Host>{count('seats','Seats (exact count)')}
  </>:value.category==='boat'?<>{count('capacityPersons','Guest capacity (exact count)')}<ChoiceChips label="Captain included" value={value.captain} options={[{value:'',label:'Either'},{value:'yes',label:'Yes'},{value:'no',label:'No'}]} onChange={next=>change('captain',next)}/></>:<Text style={styles.help}>Choose Homes, Cars or Boats for category-specific filters.</Text>}
 </View>
}
const styles=StyleSheet.create({fields:{gap:space.lg},help:{color:colors.muted,fontFamily:fonts.regular,fontSize:13,lineHeight:22}})
