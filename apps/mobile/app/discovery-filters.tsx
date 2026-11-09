import{useState}from'react'
import{KeyboardAvoidingView,Platform,StyleSheet,Text}from'react-native'
import{Stack,router,useLocalSearchParams}from'expo-router'
import{Page}from'../src/components/Page'
import{Button}from'../src/components/Button'
import{DiscoveryFilterFields}from'../src/components/discovery-filter-fields'
import{discoveryFilterError,discoveryRouteParams,emptyDiscoveryFilters,normalizedDiscoveryFilters}from'../src/lib/discovery-input'
import{colors,fonts}from'../src/theme'
export default function DiscoveryFiltersScreen(){
 const params=useLocalSearchParams<Record<string,string|string[]>>()
 const[form,setForm]=useState(()=>normalizedDiscoveryFilters(params))
 const[error,setError]=useState<string|null>(null)
 function apply(){const invalid=discoveryFilterError(form);if(invalid){setError(invalid);return}const next=normalizedDiscoveryFilters(discoveryRouteParams(form));router.dismissTo({pathname:params.from==='feed'?'/walkthrough-feed':'/(tabs)/explore',params:discoveryRouteParams(next)})}
 return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==='ios'?'padding':'height'}><Stack.Screen options={{title:'Discovery filters',presentation:'formSheet',sheetGrabberVisible:true,sheetAllowedDetents:[0.9,1]}}/>
  <Page title="Find your fit" subtitle="Apply the same location, budget and asset filters used by Rentral’s marketplace."><DiscoveryFilterFields value={form} onChange={next=>{setForm(next);setError(null)}}/>{error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}<Button title="Apply discovery filters" onPress={apply}/><Button title="Save this search" secondary onPress={()=>{const invalid=discoveryFilterError(form);if(invalid){setError(invalid);return}router.push({pathname:'/saved-searches',params:{...discoveryRouteParams({...form,view:params.from==='feed'?'feed':form.view}),from:'discovery'}})}}/><Button title="Clear all filters" secondary onPress={()=>{setForm(emptyDiscoveryFilters());setError(null)}}/></Page>
 </KeyboardAvoidingView>
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:colors.background},error:{color:colors.warning,fontFamily:fonts.medium,fontSize:13,lineHeight:22}})
