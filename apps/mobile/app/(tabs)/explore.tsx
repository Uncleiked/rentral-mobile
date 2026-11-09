import{useLayoutEffect,useMemo,useRef,useState}from'react'
import{AppState,FlatList,Keyboard,Pressable,StyleSheet,Text,View,type FlatListProps}from'react-native'
import{SafeAreaView}from'react-native-safe-area-context'
import{router,useLocalSearchParams}from'expo-router'
import Ionicons from'@expo/vector-icons/Ionicons'
import{ListingCard}from'../../src/components/ListingCard'
import{Field}from'../../src/components/Field'
import{Button}from'../../src/components/Button'
import{StatusView}from'../../src/components/StatusView'
import{useMemberPages}from'../../src/hooks/use-member-resource'
import{useMemberResource}from'../../src/hooks/use-member-resource'
import{useActorGuard}from'../../src/hooks/use-actor-guard'
import{SponsoredListingCard}from'../../src/components/sponsored-listing-card'
import{recordSponsoredObservation,sponsoredApiPath,sponsoredPageSchema,type SponsoredPlacement}from'../../src/lib/sponsored-api'
import type{Listing}from'../../src/lib/types'
import{discoveryApiPath,discoveryCategoryChange,discoveryFilterCount,discoveryPageSchema,discoveryRouteParams,emptyDiscoveryFilters,normalizedDiscoveryFilters,type DiscoveryFilters}from'../../src/lib/discovery-input'
import{colors,fonts,radius,space}from'../../src/theme'
import{searchObservation}from'../../src/lib/native-analytics'
import{useNativeObservation}from'../../src/hooks/use-native-observation'
const categories=[{value:'all',label:'All',icon:'grid-outline'},{value:'house',label:'Homes',icon:'home-outline'},{value:'car',label:'Cars',icon:'car-sport-outline'},{value:'boat',label:'Boats',icon:'boat-outline'}]as const
type DiscoveryRow={kind:'sponsored';placement:SponsoredPlacement;first:boolean}|{kind:'organic';listing:Listing;first:boolean}
type DiscoveryViewability=Parameters<NonNullable<FlatListProps<DiscoveryRow>['onViewableItemsChanged']>>[0]
export default function Explore(){
 const params=useLocalSearchParams<Record<string,string|string[]>>()
 const filters=normalizedDiscoveryFilters(params)
 useNativeObservation(searchObservation(filters))
 const resource=useMemberPages(discoveryApiPath(filters),discoveryPageSchema)
 const sponsored=useMemberResource(sponsoredApiPath(filters),sponsoredPageSchema)
 const{actorId,isCurrent}=useActorGuard()
 const observedActor=useRef(actorId)
 useLayoutEffect(()=>{observedActor.current=actorId},[actorId])
 const[viewability]=useState(()=>({itemVisiblePercentThreshold:50,minimumViewTime:1000}))
 const[onViewableItemsChanged]=useState<NonNullable<FlatListProps<DiscoveryRow>['onViewableItemsChanged']>>(()=>(info:DiscoveryViewability)=>{
  const captured=observedActor.current
  if(!isCurrent(captured)||AppState.currentState!=='active')return
  for(const token of info.viewableItems)if(token.isViewable&&token.item.kind==='sponsored')void recordSponsoredObservation(captured,{campaignId:token.item.placement.campaignId,event:'impression'})
 })
 const rows=useMemo<DiscoveryRow[]>(()=>[...(sponsored.data?.items??[]).map((placement,index)=>({kind:'sponsored' as const,placement,first:index===0})),...resource.items.map((listing,index)=>({kind:'organic' as const,listing,first:index===0}))],[sponsored.data,resource.items])
 const[search,setSearch]=useState({base:filters.q,value:filters.q})
 const query=search.base===filters.q?search.value:filters.q
 const count=discoveryFilterCount(filters)
 const apply=(next:DiscoveryFilters)=>router.replace({pathname:'/(tabs)/explore',params:discoveryRouteParams(next)})
 const refresh=()=>{void resource.refresh(true).catch(()=>undefined);void sponsored.refresh(true).catch(()=>undefined)}
 function searchNow(){Keyboard.dismiss();apply({...filters,q:query.trim(),cursor:null})}
 return <SafeAreaView style={styles.safe} edges={['top','left','right']}><FlatList data={rows} keyExtractor={item=>item.kind==='sponsored'?`sponsored:${item.placement.campaignId}`:`organic:${item.listing.id}`} renderItem={({item})=>item.kind==='sponsored'?<View style={styles.rowGroup}>{item.first?<><Text accessibilityRole="header" style={styles.sectionTitle}>Sponsored listings</Text><Text style={styles.subtitle}>Paid placements are separate from marketplace results below.</Text></>:null}<SponsoredListingCard placement={item.placement}/></View>:<View style={styles.rowGroup}>{item.first&&sponsored.data?.items.length?<Text accessibilityRole="header" style={styles.sectionTitle}>Marketplace results</Text>:null}<ListingCard listing={item.listing}/></View>} viewabilityConfig={viewability} onViewableItemsChanged={onViewableItemsChanged} contentContainerStyle={styles.content} ItemSeparatorComponent={()=><View style={styles.spacer}/>} refreshing={resource.refreshing||sponsored.refreshing} onRefresh={refresh} keyboardShouldPersistTaps="handled"
  ListHeaderComponent={<View style={styles.header}><View style={styles.brandRow}><Text style={styles.brand}>rentral.</Text><View style={styles.location}><Ionicons name="location-outline" size={14} color={colors.accentBright}/><Text style={styles.locationText}>Lagos, Nigeria</Text></View></View>
   <Text accessibilityRole="header" style={styles.title}>Find your next{'\n'}good thing.</Text><Text style={styles.subtitle}>A home. A weekend drive. A day on the water.</Text>
   <View style={styles.searchRow}><View style={styles.flex}><Field label="Search by location" placeholder="Try Lekki, Yaba, Ikoyi…" value={query} maxLength={100} onChangeText={value=>setSearch({base:filters.q,value})} returnKeyType="search" onSubmitEditing={searchNow}/></View><Pressable accessibilityRole="button" accessibilityLabel="Search listings" onPress={searchNow} style={styles.searchButton}><Ionicons name="search" color={colors.inverse} size={22}/></Pressable></View>
   <View style={styles.categories}>{categories.map(item=><Pressable accessibilityRole="button" accessibilityLabel={item.label} accessibilityState={{selected:filters.category===item.value}} key={item.value} onPress={()=>apply(discoveryCategoryChange(filters,item.value))} style={[styles.category,filters.category===item.value&&styles.selected]}><Ionicons name={item.icon} size={20} color={filters.category===item.value?colors.accentBright:colors.muted}/><Text style={[styles.categoryLabel,filters.category===item.value&&styles.selectedText]}>{item.label}</Text></Pressable>)}</View>
   <Text accessibilityRole="header" style={styles.sectionTitle}>{filters.q?`Places around ${filters.q}`:'Explore the marketplace'}</Text><Text style={styles.subtitle}>{count?`${count} ${count===1?'filter':'filters'} applied. Category counts are exact matches.`:'Browse cards or open the walkthrough feed.'}</Text>
   <Button title="Open discovery filters" secondary onPress={()=>router.push({pathname:'/discovery-filters',params:discoveryRouteParams(filters)})}/><Button title="Watch walkthroughs" secondary onPress={()=>router.push({pathname:'/walkthrough-feed',params:discoveryRouteParams({...filters,view:'feed'})})}/>
   <Button title="Save or open searches on this device" secondary onPress={()=>router.push({pathname:'/saved-searches',params:{...discoveryRouteParams(filters),from:'discovery'}})}/>
   {count?<Button title="Clear discovery filters" secondary onPress={()=>apply(emptyDiscoveryFilters())}/>:null}
   {resource.error&&resource.data?<><Text accessibilityRole="alert" style={styles.error}>Could not refresh: {resource.error}</Text><Button title="Refresh discovery" secondary onPress={refresh}/></>:null}
   {sponsored.error?<><Text style={styles.subtitle}>Sponsored placements are temporarily unavailable.</Text><Button title="Retry sponsored placements" secondary onPress={()=>{void sponsored.refresh(true).catch(()=>undefined)}}/></>:null}
  </View>}
  ListEmptyComponent={resource.loading?<StatusView loading message="Finding your next move…"/>:resource.error?<StatusView title="Could not load listings" message={resource.error} onRetry={refresh}/>:<StatusView title="No listings match yet" message="Try another location, category or filter combination."/>}
  ListFooterComponent={<View style={styles.footer}>{sponsored.data?.items.length&&!resource.items.length?<StatusView loading={resource.loading} title={resource.error?'Could not load marketplace results':'No ordinary listings match yet'} message={resource.error??'Try another location, category or filter combination.'} onRetry={resource.error?refresh:undefined}/>:null}{resource.moreError?<Text accessibilityRole="alert" style={styles.error}>{resource.moreError}</Text>:null}{resource.hasMore?<Button title="More listings" secondary busy={resource.loadingMore} onPress={()=>{void resource.loadMore()}}/>:resource.items.length?<Text style={styles.subtitle}>You’ve reached the end of these results.</Text>:null}</View>}/>
 </SafeAreaView>
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},content:{width:'100%',maxWidth:760,alignSelf:'center',padding:space.xl,paddingBottom:space.xxl},header:{gap:space.xl,paddingBottom:space.xl},rowGroup:{gap:space.lg},brandRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:space.sm},brand:{fontFamily:fonts.bold,color:colors.text,fontSize:27,letterSpacing:-1.5},location:{flexDirection:'row',alignItems:'center',gap:space.xs},locationText:{color:colors.secondary,fontFamily:fonts.medium,fontSize:11},title:{color:colors.text,fontFamily:fonts.semibold,fontSize:40,lineHeight:45,letterSpacing:-1.4},subtitle:{color:colors.muted,fontFamily:fonts.regular,fontSize:13,lineHeight:22},searchRow:{flexDirection:'row',alignItems:'flex-end',gap:space.sm},flex:{flex:1},searchButton:{width:52,height:52,borderRadius:radius.md,backgroundColor:colors.accentBright,alignItems:'center',justifyContent:'center'},categories:{flexDirection:'row',gap:space.sm},category:{flex:1,borderRadius:radius.lg,borderWidth:1,borderColor:colors.border,alignItems:'center',paddingVertical:space.md,gap:space.sm},selected:{backgroundColor:colors.accentMuted,borderColor:colors.accent},categoryLabel:{color:colors.muted,fontFamily:fonts.medium,fontSize:12},selectedText:{color:colors.accentBright},sectionTitle:{fontFamily:fonts.semibold,color:colors.text,fontSize:19},spacer:{height:space.xl},footer:{paddingVertical:space.xl,gap:space.md},error:{color:colors.warning,fontSize:13,fontFamily:fonts.medium,lineHeight:22}})
