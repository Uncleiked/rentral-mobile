import{useCallback,useEffect,useRef,useState}from'react'
import{AppState,FlatList,StyleSheet,Text,View,useWindowDimensions,type FlatListProps}from'react-native'
import{SafeAreaView}from'react-native-safe-area-context'
import{Stack,router,useFocusEffect,useLocalSearchParams}from'expo-router'
import{Button}from'../src/components/Button'
import{StatusView}from'../src/components/StatusView'
import{WalkthroughFeedCard}from'../src/components/walkthrough-feed-card'
import{useMemberPages}from'../src/hooks/use-member-resource'
import{discoveryApiPath,discoveryPageSchema,discoveryRouteParams,normalizedDiscoveryFilters,visibleFeedIndex,visibleFeedListing}from'../src/lib/discovery-input'
import{colors,fonts,space}from'../src/theme'
import type{Listing}from'../src/lib/types'
type ViewabilityChange=Parameters<NonNullable<FlatListProps<Listing>['onViewableItemsChanged']>>[0]
export default function WalkthroughFeedScreen(){
 const params=useLocalSearchParams<Record<string,string|string[]>>()
 const{fontScale}=useWindowDimensions()
 const filters={...normalizedDiscoveryFilters(params),view:'feed' as const}
 const path=discoveryApiPath(filters)
 const resource=useMemberPages(path,discoveryPageSchema)
 const[focused,setFocused]=useState(false)
 const[foreground,setForeground]=useState(AppState.currentState==='active')
 const[height,setHeight]=useState(600)
 const[visible,setVisible]=useState<{path:string;id:string|null}|null>(null)
 const scroll=useRef({offset:0,viewport:600})
 const currentPath=useRef(path)
 useEffect(()=>{currentPath.current=path;scroll.current.offset=0},[path])
 useFocusEffect(useCallback(()=>{setFocused(true);return()=>setFocused(false)},[]))
 useEffect(()=>{const listener=AppState.addEventListener('change',state=>setForeground(state==='active'));return()=>listener.remove()},[])
 const[visibility]=useState({itemVisiblePercentThreshold:50})
 const compact=height<560||fontScale>1.3
 const compactMode=useRef(compact)
 useEffect(()=>{compactMode.current=compact},[compact])
 const onViewable=useCallback(({viewableItems}:ViewabilityChange)=>{if(!compactMode.current)return;const first=viewableItems.find(item=>item.isViewable);setVisible({path:currentPath.current,id:first&&typeof first.item?.id==='string'?first.item.id:null})},[])
 const updatePagedVisibility=()=>{if(compact)return;const index=visibleFeedIndex(scroll.current.offset,scroll.current.viewport,height,resource.items.length);setVisible({path,id:index===null?null:resource.items[index]?.id??null})}
 const active=visibleFeedListing(path,visible,resource.items)
 const refresh=()=>{void resource.refresh(true).catch(()=>undefined)}
 return <SafeAreaView style={styles.safe} edges={['bottom','left','right']}><Stack.Screen options={{title:'Walkthrough feed',headerShown:true}}/>
  <View style={styles.header}><Text style={styles.help}>Swipe to explore. Open a walkthrough to play it. Playback pauses off-screen and in the background.</Text><View style={styles.row}><View style={styles.flex}><Button title="Feed filters" secondary onPress={()=>router.push({pathname:'/discovery-filters',params:{...discoveryRouteParams(filters),from:'feed'}})}/></View><View style={styles.flex}><Button title="Browse cards" secondary onPress={()=>router.dismissTo({pathname:'/(tabs)/explore',params:discoveryRouteParams({...filters,view:'grid'})})}/></View></View>{resource.error&&resource.data?<Text accessibilityRole="alert" style={styles.error}>Could not refresh: {resource.error}</Text>:null}</View>
  <View style={styles.flex} onLayout={event=>setHeight(Math.floor(event.nativeEvent.layout.height))}><FlatList key={path} data={resource.items} keyExtractor={item=>item.id} renderItem={({item})=><WalkthroughFeedCard listing={item} active={Boolean(focused&&foreground&&item.id===active)} height={height} compact={compact}/>} pagingEnabled={!compact} initialNumToRender={1} maxToRenderPerBatch={2} windowSize={3} viewabilityConfig={visibility} onViewableItemsChanged={onViewable} refreshing={resource.refreshing} onRefresh={refresh}
   onLayout={event=>{scroll.current={...scroll.current,viewport:event.nativeEvent.layout.height};updatePagedVisibility()}} onContentSizeChange={updatePagedVisibility} scrollEventThrottle={100} onScroll={event=>{scroll.current={offset:event.nativeEvent.contentOffset.y,viewport:event.nativeEvent.layoutMeasurement.height};updatePagedVisibility()}}
   ListEmptyComponent={resource.loading?<StatusView loading message="Loading walkthroughs…"/>:resource.error?<StatusView title="Walkthrough feed unavailable" message={resource.error} onRetry={refresh}/>:<StatusView title="No walkthroughs match" message="Change your filters to explore other listings."/>}
   ListFooterComponent={<View style={styles.footer}>{resource.moreError?<Text style={styles.error}>{resource.moreError}</Text>:null}{resource.hasMore?<Button title="More walkthroughs" secondary busy={resource.loadingMore} onPress={()=>{void resource.loadMore()}}/>:resource.items.length?<Text style={styles.help}>You’ve reached the end of these results.</Text>:null}</View>}/></View>
 </SafeAreaView>
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},header:{padding:space.lg,gap:space.md},help:{color:colors.muted,fontFamily:fonts.regular,fontSize:12,lineHeight:21},row:{flexDirection:'row',gap:space.sm},flex:{flex:1},footer:{padding:space.xl,gap:space.lg},error:{color:colors.warning,fontFamily:fonts.medium,fontSize:13,lineHeight:22}})
