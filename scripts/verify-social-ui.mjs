// Loopback synthetic browser audit. Never loads application environment or server/database modules.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', id='cccccccc-cccc-4ccc-8ccc-cccccccccccc', listing='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const output='output/playwright/social-workspace'; mkdirSync(output,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
const results=[]
async function fixture(page, options={}) {
 const errors=[],outbound=[],commands=[],activity=[]
 const person={id:other,username:'lagos_host',displayName:'Lagos host and property manager',avatarUrl:null,accountType:'individual',following:false,followedBy:true,followersCount:10,followingCount:4,blocked:false}
 let liked=false,count=2,accepted=Boolean(options.primary),lostLike=Boolean(options.lostLike),lostFollow=Boolean(options.lostFollow),lostSend=Boolean(options.lostSend),searchFailure=Boolean(options.searchFailure),sentCommand=null,notificationRead=false,lostNotificationRead=true,lostBlock=true,reciprocalInitialized=false,sessionFailure=Boolean(options.sessionFailure)
 const messages=[{id:'11111111-1111-4111-8111-111111111111',senderId:other,body:'Hello! Is this apartment still available?',sentAt:'2026-11-13T12:00:00.000Z',sharedListing:null}]
 const thread=()=>({id,userId:actor,otherId:other,otherName:'lagos_host',listingId:options.listing?listing:null,otherReadAt:accepted?'2026-11-13T12:01:00.000Z':null,hasMore:false,folder:accepted?'primary':'requests',kind:options.listing?'listing':'direct',requestIncoming:!accepted,canSend:accepted,canAccept:!accepted,messages})
 const item=()=>({id,listingId:options.listing?listing:null,updatedAt:'2026-11-13T12:00:00.000Z',otherId:other,otherName:'lagos_host',lastMessage:'Hello! Is this apartment still available?',unread:true,folder:accepted?'primary':'requests',kind:options.listing?'listing':'direct',requestIncoming:!accepted,canSend:accepted,canAccept:!accepted})
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url())
  if(url.hostname!=='127.0.0.1'){outbound.push(url.origin);return route.abort('blockedbyclient')}
  if(!url.pathname.startsWith('/api/'))return route.continue()
  const reply=(data,status=200,code='FIXTURE_ONLY')=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(status<400?{success:true,data}:{success:false,error:data,code})})
  if(url.pathname==='/api/v1/auth/web-session'){if(sessionFailure){sessionFailure=false;return reply('Account lookup is temporarily unavailable.',503)}return reply({user:{id:actor}})}
  assert.equal(request.headers()['x-rentral-account'],actor)
  if(url.pathname==='/api/v1/people'){
   if(searchFailure){searchFailure=false;return reply('MongoDB is not prepared. Run npm run db:setup.',503,'DATABASE_SETUP_REQUIRED')}
   const query=url.searchParams.get('query')||''
   return reply({items:query==='nobody'?[]:[{...person}],nextCursor:null,hasMore:false})
  }
  if(url.pathname==='/api/v1/people/'+other){if(new URL(page.url()).searchParams.has('reciprocal')){if(!reciprocalInitialized){person.blocked=true;reciprocalInitialized=true}return reply('This member is unavailable.',404)}return reply({...person})}
  if(url.pathname.endsWith('/connections'))return reply({items:[{...person,id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',username:'abuja_member',displayName:'Abuja member',following:false,followedBy:false}],nextCursor:null,hasMore:false})
  if(url.pathname.endsWith('/follow')){const body=request.postDataJSON();commands.push({type:'follow',...body});const before=person.following;person.following=body.following;person.followersCount+=before===body.following?0:body.following?1:-1;if(lostFollow){lostFollow=false;return route.abort('failed')}return reply({...person})}
  if(url.pathname.endsWith('/block')){if(request.method()==='GET')return reply({personId:other,blocked:person.blocked});const body=request.postDataJSON();commands.push({type:'block',...body});person.blocked=body.blocked;if(person.blocked){person.following=false;person.followedBy=false;person.followersCount=9}if(lostBlock){lostBlock=false;return route.abort('failed')}return reply({personId:other,blocked:person.blocked})}
  if(url.pathname==='/api/v1/listings/'+listing+'/like'){
   if(request.method()==='POST'){const body=request.postDataJSON();commands.push({type:'like',...body});if(liked!==body.liked)count+=body.liked?1:-1;liked=body.liked;if(lostLike){lostLike=false;return route.abort('failed')}}
   return reply({listingId:listing,liked,count})
  }
  if(url.pathname==='/api/v1/notifications')return reply({items:url.searchParams.has('cursor')?[{id:'55555555-5555-4555-8555-555555555555',kind:'booking_requested',title:'Inspection booking requested',body:'An earlier booking update.',href:'/marketplace/bookings',readAt:null,createdAt:'2026-11-12T10:00:00.000Z'}]:[{id:'33333333-3333-4333-8333-333333333333',kind:'social_follow',title:'New follower',body:'@abuja_member started following you.',href:'/marketplace/profile/abuja_member',readAt:notificationRead?'2026-11-13T12:03:00.000Z':null,createdAt:'2026-11-13T12:00:00.000Z'},{id:'44444444-4444-4444-8444-444444444444',kind:'social_like',title:'Your listing was liked',body:'@lagos_host liked your listing.',href:'/marketplace/listing/'+listing,readAt:null,createdAt:'2026-11-13T11:00:00.000Z'}],nextCursor:url.searchParams.has('cursor')?null:'older-notification-page',limit:20})
  if(url.pathname==='/api/v1/notifications/33333333-3333-4333-8333-333333333333/read'){assert.equal(request.method(),'PATCH');assert.deepEqual(request.postDataJSON(),{});commands.push({type:'notification_read'});notificationRead=true;if(lostNotificationRead){lostNotificationRead=false;return route.abort('failed')}return reply({id:'33333333-3333-4333-8333-333333333333',readAt:'2026-11-13T12:03:00.000Z'})}
  if(url.pathname==='/api/v1/messages'&&request.method()==='POST'){commands.push({type:'direct',...request.postDataJSON()});return reply({id},201)}
  if(url.pathname==='/api/v1/messages'){const folder=url.searchParams.get('folder');return reply({items:folder===(accepted?'primary':'requests')?[item()]:[],limit:20,nextCursor:null})}
  if(url.pathname==='/api/v1/messages/'+id){
   if(request.method()==='POST'){sentCommand=request.postDataJSON();commands.push({type:'send',...sentCommand});messages.push({id:'22222222-2222-4222-8222-222222222222',senderId:actor,body:sentCommand.body,sentAt:'2026-11-13T12:02:00.000Z',sharedListing:null});if(lostSend){lostSend=false;return route.abort('failed')}return reply({id:messages.at(-1).id},201)}
   return reply(thread())
  }
  if(url.pathname.endsWith('/accept')){if(request.method()==='POST'){commands.push({type:'accept',...request.postDataJSON()});accepted=true}return accepted?reply({id,accepted:true}):reply('No saved acceptance.',404)}
  if(url.pathname.endsWith('/send'))return sentCommand?reply({id:messages.at(-1).id}):reply('No saved message.',404)
  if(url.pathname.endsWith('/activity')){activity.push(request.method());return request.method()==='GET'?reply({otherOnline:true,otherTyping:true,otherReadAt:'2026-11-13T12:01:00.000Z',latestMessageId:null}):reply({saved:true})}
  errors.push('Unexpected fixture request '+request.method()+' '+url.pathname);return route.abort('blockedbyclient')
 })
 return {errors,outbound,commands,activity}
}
async function layout(page,label,width){await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Horizontal overflow '+label+' '+width);await page.screenshot({path:output+'/'+width+'-'+label+'.png',fullPage:true})}
try {
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage()
  const state=await fixture(page,{lostLike:true,lostFollow:true,lostSend:true,searchFailure:true,sessionFailure:true})
  await page.goto('http://127.0.0.1:4190/?view=people');await page.getByText('Community features are being prepared. Please try again later.',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'No matching people'}).count(),0);await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('link',{name:'@lagos_host',exact:true}).waitFor()
  await page.getByRole('button',{name:'Follow back',exact:true}).click();await page.getByRole('button',{name:'Check follow status',exact:true}).click();await page.getByRole('button',{name:'Following',exact:true}).waitFor()
  await page.getByRole('button',{name:'Following',exact:true}).click();await page.getByRole('button',{name:'Follow back',exact:true}).waitFor()
  await page.getByRole('searchbox',{name:'Search people'}).fill('nobody');await page.getByRole('button',{name:'Search people',exact:true}).click();await page.getByRole('heading',{name:'No matching people'}).waitFor()
  await page.getByRole('button',{name:'Clear',exact:true}).click();await page.getByRole('link',{name:'@lagos_host',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Message @lagos_host'}).getAttribute('href'),'/marketplace/messages?user='+other)
  await layout(page,'people',width)
  await page.goto('http://127.0.0.1:4190/?view=profile');await page.getByRole('button',{name:'Retry account check',exact:true}).click();await page.getByRole('button',{name:'10 Followers',exact:true}).click();await page.getByRole('dialog',{name:'Followers',exact:true}).waitFor();await page.getByRole('link',{name:'@abuja_member',exact:true}).waitFor();await layout(page,'followers',width);await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0)
  await page.getByRole('button',{name:'Block',exact:true}).click();await page.getByRole('button',{name:'Confirm block',exact:true}).click();await page.getByRole('button',{name:'Check block status',exact:true}).click();await page.getByRole('button',{name:'Unblock',exact:true}).waitFor();await page.getByRole('button',{name:'Unblock',exact:true}).click();await page.getByRole('button',{name:'Confirm unblock',exact:true}).click();await page.getByRole('button',{name:'Block',exact:true}).waitFor();await layout(page,'profile',width)
  await page.goto('http://127.0.0.1:4190/?view=profile&reciprocal=1');await page.getByRole('button',{name:'Unblock',exact:true}).click();await page.getByRole('button',{name:'Confirm unblock',exact:true}).click();await page.getByText('Your block was removed.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Unblock',exact:true}).count(),0)
  await page.goto('http://127.0.0.1:4190/?view=likes');await page.getByRole('button',{name:'Like listing',exact:true}).waitFor();await page.getByRole('button',{name:'Like listing',exact:true}).click();await page.getByRole('button',{name:'Check current likes'}).click();await page.getByRole('button',{name:'Unlike listing',exact:true}).waitFor();await page.getByRole('button',{name:'Unlike listing',exact:true}).click();await page.getByRole('button',{name:'Like listing',exact:true}).waitFor();await page.getByRole('button',{name:'Save listing',exact:true}).click();await page.getByRole('button',{name:'Remove from saved',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.__saveCalls.length),1);await layout(page,'likes',width)
  await page.goto('http://127.0.0.1:4190/?view=inbox&folder=requests');await page.getByRole('link',{name:/lagos_host/}).waitFor();await page.getByRole('button',{name:'Primary',exact:true}).click();await page.getByText('No conversations yet.',{exact:false}).waitFor();await page.getByRole('button',{name:'Sent requests',exact:true}).click();await page.getByText('No pending introductions.',{exact:false}).waitFor();await page.getByRole('button',{name:'Requests',exact:true}).click();await page.getByRole('link',{name:/lagos_host/}).waitFor();await layout(page,'requests',width)
  await page.goto('http://127.0.0.1:4190/?view=inbox&thread=1&folder=requests');await page.getByRole('button',{name:'Move to Primary',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).count(),0);assert.equal(state.activity.length,0);assert.equal(await page.evaluate(()=>window.__readCalls||0),0);await layout(page,'request-thread',width)
  await page.getByRole('button',{name:'Move to Primary',exact:true}).click();await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Primary',exact:true,includeHidden:true}).getAttribute('aria-current'),'page');await page.locator('aside[aria-label="Conversations"] a[href*="?id="]').waitFor({state:'attached'});await page.getByText('Typing...', {exact:true}).waitFor();await page.getByRole('textbox',{name:'Message',exact:true}).fill('Confirmed viewing tomorrow, thank you.');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByRole('button',{name:'Check sent status',exact:true}).click();await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'');await page.getByText('Confirmed viewing tomorrow, thank you.',{exact:true}).waitFor();await layout(page,'primary-thread',width)
  await page.goto('http://127.0.0.1:4190/?view=inbox&user=1');await page.getByRole('button',{name:'Open conversation',exact:true}).click();await page.waitForFunction(()=>window.__socialNavigations?.some(href=>href.includes('/marketplace/messages?id=')))
  await page.goto('http://127.0.0.1:4190/?view=notifications');await page.getByRole('heading',{name:'New follower',exact:true}).waitFor();await page.getByRole('button',{name:'Mark New follower as read',exact:true}).click();await page.getByRole('alert').waitFor();await page.getByRole('button',{name:'Mark New follower as read',exact:true}).click();await page.waitForFunction(()=>![...document.querySelectorAll('button')].some(button=>button.getAttribute('aria-label')==='Mark New follower as read'));await page.getByRole('button',{name:'Load earlier notifications',exact:true}).click();await page.getByRole('heading',{name:'Inspection booking requested',exact:true}).waitFor();await layout(page,'notifications',width)
  await page.goto('http://127.0.0.1:4190/?view=people&path=/admin');assert.equal(await page.getByRole('link',{name:'Rentral admin dashboard',exact:true}).getAttribute('href'),'/admin')
  if(width<1280){await page.getByRole('button',{name:'Open navigation',exact:true}).click();assert.equal(await page.getByRole('navigation',{name:'Additional navigation'}).getByRole('link',{name:'People',exact:true}).getAttribute('href'),'/marketplace/people');await page.keyboard.press('Escape')}
  await page.goto('http://127.0.0.1:4190/?view=people&path=/marketplace/profile');assert.equal(await page.getByRole('link',{name:'Rentral marketplace',exact:true}).getAttribute('href'),'/marketplace')
  const likes=state.commands.filter(command=>command.type==='like');assert.deepEqual(likes.map(command=>command.liked),[true,false]);assert.notEqual(likes[0].clientId,likes[1].clientId);assert.equal(state.commands.filter(command=>command.type==='send').length,1)
  assert.deepEqual(state.errors,[]);assert.deepEqual(state.outbound,[])
  results.push({width,status:'passed',commands:state.commands.map(command=>command.type),activityRequests:state.activity.length});await context.close();console.log('Passed social workflows at '+width+'px')
 }
 writeFileSync(output+'/audit.json',JSON.stringify({verifiedAt:new Date().toISOString(),results},null,2))
} finally { await browser.close() }
