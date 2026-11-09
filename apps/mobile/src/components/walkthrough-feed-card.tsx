import{useState}from'react'
import{Image,StyleSheet,Text,View}from'react-native'
import{useEvent}from'expo'
import{useVideoPlayer,VideoView}from'expo-video'
import{router}from'expo-router'
import{z}from'zod'
import{Button}from'./Button'
import{useMemberResource}from'../hooks/use-member-resource'
import{useAuth}from'../providers/AuthProvider'
import{listingPriceLabel,saveDiscoveryListing}from'../lib/discovery-input'
import{nativeMediaUrl}from'../lib/media-url'
import{config}from'../lib/config'
import{errorMessage}from'../lib/api'
import type{Listing}from'../lib/types'
import{colors,fonts,radius,space}from'../theme'
const mediaSchema=z.object({videoUrl:z.string().url().nullable(),posterUrl:z.string().url().nullable(),expiresAt:z.string().datetime({offset:true})})
function FeedVideo({uri,onRefresh}:{uri:string;onRefresh:()=>void}){
 const player=useVideoPlayer({uri,contentType:uri.includes('.m3u8')?'hls':'auto'},value=>{value.loop=true;value.muted=true;value.play()})
 const{isPlaying}=useEvent(player,'playingChange',{isPlaying:player.playing})
 const{muted}=useEvent(player,'mutedChange',{muted:player.muted})
 const{status}=useEvent(player,'statusChange',{status:player.status})
 function toggleMute(){
  // eslint-disable-next-line react-hooks/immutability -- Expo VideoPlayer is an imperative native SharedObject, not React state.
  player.muted=!muted
 }
 return <View style={styles.player}><VideoView testID="active-walkthrough-player" player={player} style={styles.video} nativeControls contentFit="contain" fullscreenOptions={{enable:true}}/>
  <View style={styles.controls}><View style={styles.flex}><Button title={isPlaying?'Pause walkthrough':'Play walkthrough'} secondary onPress={()=>isPlaying?player.pause():player.play()}/></View><View style={styles.flex}><Button title={muted?'Unmute walkthrough':'Mute walkthrough'} secondary onPress={toggleMute}/></View></View>
  {status==='loading'?<Text style={styles.help}>Preparing walkthrough…</Text>:status==='error'?<><Text accessibilityRole="alert" style={styles.error}>This walkthrough could not be played.</Text><Button title="Refresh walkthrough link" secondary onPress={onRefresh}/></>:null}
 </View>
}
export function WalkthroughFeedCard({listing,active,height,compact}:{listing:Listing;active:boolean;height:number;compact:boolean}){
 const media=useMemberResource(`/listings/${listing.id}/media`,mediaSchema,active,240000)
 const{session}=useAuth()
 const[requested,setRequested]=useState(false)
 const[localSaved,setLocalSaved]=useState<{base:Listing;saved:boolean}|null>(null)
 const[saving,setSaving]=useState(false)
 const[error,setError]=useState<string|null>(null)
 const saved=localSaved?.base===listing?localSaved.saved:listing.saved
 const uri=nativeMediaUrl(media.data?.videoUrl??null,config.apiUrl)
 const poster=nativeMediaUrl(media.data?.posterUrl??null,config.apiUrl)
 async function save(){if(saving||!session)return;setSaving(true);setError(null);try{const result=await saveDiscoveryListing(listing.id,!saved,session.user.id);setLocalSaved({base:listing,saved:result.saved})}catch(failure){setError(errorMessage(failure))}finally{setSaving(false)}}
 const refresh=()=>{void media.refresh(true).catch(()=>undefined)}
 return <View style={[styles.card,compact?styles.compact:{height}]}>
  <View style={[styles.frame,compact&&styles.compactFrame]}>{active&&requested&&uri?<FeedVideo key={uri} uri={uri} onRefresh={refresh}/>:<View style={styles.placeholder}>
   {poster?<Image source={{uri:poster}} alt={`Preview of ${listing.title}`} style={styles.poster} resizeMode="cover"/>:null}
   {uri||media.loading?<View style={styles.open}><Button title={media.loading?'Loading walkthrough…':'Open walkthrough'} busy={media.loading} disabled={!active||!uri} onPress={()=>setRequested(true)}/></View>:null}
   {active&&!media.loading&&!uri?<><Text style={styles.help}>{media.error??'This listing has no playable walkthrough yet.'}</Text><Button title="Reload walkthrough" secondary onPress={refresh}/></>:null}
  </View>}</View>
  <View style={styles.copy}><Text style={styles.title} numberOfLines={2}>{listing.title}</Text><Text style={styles.help}>{listing.location} · @{listing.host.username}{listing.holdUntil?' · On hold':''}</Text><Text selectable style={styles.price}>{listingPriceLabel(listing.price)} <Text style={styles.help}>/ {listing.pricePeriod}</Text></Text>
   <View style={styles.controls}><View style={styles.flex}><Button title="View listing details" secondary onPress={()=>router.push({pathname:'/listing/[id]',params:{id:listing.id}})}/></View>{listing.savingAvailable?<View style={styles.flex}><Button title={saved?'Remove saved listing':'Save listing'} secondary busy={saving} onPress={()=>{void save()}}/></View>:null}</View>
   {error||media.error?<Text accessibilityRole="alert" style={styles.error}>{error??media.error}</Text>:null}
  </View>
 </View>
}
const styles=StyleSheet.create({card:{padding:space.lg,gap:space.lg,backgroundColor:colors.background},compact:{minHeight:480},frame:{flex:1,minHeight:180,backgroundColor:colors.surface,borderColor:colors.border,borderWidth:1,borderRadius:radius.xl,overflow:'hidden'},compactFrame:{flex:0,minHeight:260},player:{flex:1,gap:space.sm},video:{flex:1,minHeight:120},placeholder:{flex:1,justifyContent:'center',padding:space.lg,gap:space.md},poster:{position:'absolute',top:0,left:0,width:'100%',height:'100%'},open:{backgroundColor:colors.overlay,borderRadius:radius.lg},copy:{gap:space.sm},title:{color:colors.text,fontFamily:fonts.semibold,fontSize:20},help:{color:colors.muted,fontFamily:fonts.regular,fontSize:12,lineHeight:21},price:{color:colors.accentBright,fontFamily:fonts.bold,fontSize:22,fontVariant:['tabular-nums']},controls:{flexDirection:'row',gap:space.sm},flex:{flex:1},error:{color:colors.warning,fontFamily:fonts.medium,fontSize:12,lineHeight:21}})
