// Real components, synthetic loopback API responses; no environment/database access.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdirSync,writeFileSync } from 'node:fs'
const actor='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',member='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',listingId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',orgId='dddddddd-dddd-4ddd-8ddd-dddddddddddd',auditId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const output='output/playwright/admin-global-search';mkdirSync(output,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[]
const user={id:member,revision:1,email:'lagos_host@fixture.invalid',username:'lagos_host',role:'member',suspended:false,closed:false,galleryAllowed:true,freePostingAllowed:false,directPublishAllowed:false,galleryPermissionRevision:1,createdAt:'2026-11-13T12:00:00.000Z'}
const listing={id:listingId,revision:1,category:'house',title:'Sunny Yaba apartment',address:'Yaba, Lagos',status:'active',publicationMode:'trusted_publisher',source:'approved_gallery',archived:false,createdAt:'2026-11-13T12:00:00.000Z',lister:{id:member,username:'lagos_host',freePostingAllowed:false,directPublishAllowed:false},document:{present:true,status:'pending',approvalMatches:false},media:{hasVideo:false,photoCount:1,status:null},locationStatus:null,fee:{waived:false,paid:true}}
const organization={id:orgId,userId:member,revision:0,legalName:'Lagos Host Limited',registrationType:'company',registrationNumber:'RC-123456',representativeName:'Lagos Host',representativeRole:'Director',documentKind:'cac_certificate',supportingKind:null,status:'pending',reviewReason:null,submittedAt:'2026-11-13T12:00:00.000Z',reviewedAt:null}
const audit={id:auditId,action:'set_gallery_permission',targetType:'user',targetId:member,reason:'Approved for gallery publication after account checks.',actorId:actor,actorUsername:'platform_owner',createdAt:'2026-11-13T12:00:00.000Z'}
try{
for(const width of[320,390,768,1440]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[],outbound=[],requests=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.hostname!=='127.0.0.1'){outbound.push(url.origin);return route.abort('blockedbyclient')}
  if(!url.pathname.startsWith('/api/'))return route.continue()
  const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(status<400?{success:true,data}:{success:false,error:'This category is temporarily unavailable.',code:'FIXTURE_UNAVAILABLE'})})
  assert.equal(req.headers()['x-rentral-account'],actor);requests.push(url.pathname+url.search)
  const query=url.searchParams.get('query')||'',empty=query==='nobody'
  if(url.pathname==='/api/v1/admin')return reply({role:'owner',permissions:['listing:review','listing:waive','user:manage','staff:manage','gallery:manage','operations:read','inspection:review'],listings:[listing],users:[user],inspections:[],audit:[{...audit,actorUsername:undefined}]})
  if(url.pathname==='/api/v1/admin/overview')return reply({generatedAt:'2026-11-13T12:00:00.000Z',queues:[]})
  if(url.pathname==='/api/v1/admin/listings')return reply({items:empty?[]:[listing],total:empty?0:9,hasMore:!empty,nextCursor:empty?null:'nextpage'})
  if(url.pathname==='/api/v1/admin/users')return reply({items:empty?[]:[user]})
  if(url.pathname==='/api/v1/admin/organizations')return reply({items:empty?[]:[organization],total:empty?0:1,hasMore:false,nextCursor:null})
  if(url.pathname==='/api/v1/admin/audit')return query==='partial'?reply(null,503):reply({items:empty?[]:[audit],total:empty?0:1,hasMore:false,nextCursor:null})
  throw new Error('Unmocked '+url.pathname)
 })
 await page.goto('http://127.0.0.1:4184',{waitUntil:'networkidle'})
 const search=page.getByRole('region',{name:'Search all administration'})
 await search.getByRole('searchbox',{name:'Search administration'}).fill('lagos')
 await search.getByRole('button',{name:'Search',exact:true}).click()
 await search.getByRole('button',{name:'Sunny Yaba apartment'}).waitFor()
 for(const name of['Listings search results','Members search results','Organizations search results','Decisions search results'])await search.getByRole('region',{name,exact:true}).waitFor()
 await page.screenshot({path:output+'/'+width+'-all.png',fullPage:true})
 await search.getByRole('button',{name:'Open listings',exact:true}).click()
 const listingPanel=page.getByRole('tabpanel',{name:'Listings',exact:true})
 assert.equal(await listingPanel.getByRole('searchbox').inputValue(),'lagos')
 assert(requests.some(url=>url.includes('/listings?')&&url.includes('query=lagos')&&url.includes('status=all')&&!url.includes('limit=5')))
 await search.getByRole('button',{name:'Open members',exact:true}).click()
 const memberPanel=page.getByRole('tabpanel',{name:'Members & permissions',exact:true})
 assert.equal(await memberPanel.getByRole('searchbox').inputValue(),'lagos')
 await search.getByRole('button',{name:'Open organizations',exact:true}).click()
 await page.getByRole('tabpanel',{name:'Organizations',exact:true}).getByRole('searchbox').waitFor()
 assert.equal(await page.getByRole('tabpanel',{name:'Organizations',exact:true}).getByRole('searchbox').inputValue(),'lagos')
 await search.getByRole('button',{name:'Open decisions',exact:true}).click()
 assert.equal(await page.getByRole('searchbox',{name:'Search audit history'}).inputValue(),'lagos')
 // Entering a member scope must not inherit an earlier global listing query.
 await search.getByRole('button',{name:'Open listings',exact:true}).click()
 await search.getByRole('region',{name:'Members search results',exact:true}).getByRole('button',{name:/^@lagos_host/}).click()
 const scopedRequest=page.waitForRequest(request=>{const url=new URL(request.url());return url.pathname==='/api/v1/admin/listings'&&url.searchParams.get('listerId')===member})
 await page.getByRole('button',{name:"View this member's listings",exact:true}).click()
 await scopedRequest
 const hostPanel=page.getByRole('tabpanel',{name:'Listings',exact:true})
 assert.equal(await hostPanel.getByRole('searchbox').inputValue(),'')

 assert(requests.some(value=>{const url=new URL(value,'http://127.0.0.1');return url.pathname==='/api/v1/admin/listings'&&url.searchParams.get('listerId')===member&&url.searchParams.get('query')===''&&url.searchParams.get('status')==='all'}))
 await search.getByRole('combobox',{name:'Category',exact:true}).selectOption('members')
 await search.getByRole('searchbox',{name:'Search administration'}).fill('nobody')
 await search.getByRole('button',{name:'Search',exact:true}).click()
 await search.getByText(/No matches/).waitFor()
 assert.equal(await search.getByRole('region').count(),1)
 await search.getByRole('combobox',{name:'Category',exact:true}).selectOption('all')
 await search.getByRole('searchbox',{name:'Search administration'}).fill('partial')
 await search.getByRole('button',{name:'Search',exact:true}).click()
 await search.getByRole('alert').waitFor()
 await search.getByRole('button',{name:'Sunny Yaba apartment'}).waitFor()
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
 assert.equal(overflow,false);assert.deepEqual(errors,[]);assert.deepEqual(outbound,[])
 results.push({width,groupedSearch:true,categorySearch:true,pagedFilterHandoff:true,hostScopeClearsInheritedQuery:true,emptyState:true,partialFailure:true,noOverflow:true,noPageErrors:true})
 await page.close()
}
writeFileSync(output+'/audit.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results))
}finally{await browser.close()}



