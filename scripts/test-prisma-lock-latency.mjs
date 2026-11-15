// Owned local diagnosis only. Never reads .env or connects to an application database.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {once} from 'node:events'
import {mkdir,writeFile,readFile,lstat,realpath,rm} from 'node:fs/promises'
import {join,resolve,basename,sep} from 'node:path'
import {MongoClient} from 'mongodb'
import {PrismaClient} from '@prisma/client'
import {ensureMongoIndexes} from '../lib/database/indexes.ts'
import {startOwnedMongoLatencyProxy} from './lib/owned-mongo-latency.mjs'
const root=process.cwd(),artifacts=join(root,'test-results'),owner=randomUUID().replaceAll('-',''),fixture=join(artifacts,'owned-lock-latency-'+owner),database='rentral_test_'+owner
const binaryArg=process.argv[process.argv.indexOf('--binary')+1]
assert(binaryArg&&process.argv.includes('--binary'))
let server,client,proxy,prisma,nativeProxy,owned=false
const results=[]
async function freePort(){const s=createServer();await new Promise((yes,no)=>{s.once('error',no);s.listen(0,'127.0.0.1',yes)});const p=s.address().port;await new Promise(yes=>s.close(yes));return p}
async function waitPrimary(port){const end=Date.now()+60000;let initiated=false;while(Date.now()<end){try{await client.db('admin').command({ping:1});if(!initiated){await client.db('admin').command({replSetInitiate:{_id:'rs0',members:[{_id:0,host:'127.0.0.1:'+port}]}});initiated=true}if((await client.db('admin').command({hello:1})).isWritablePrimary)return}catch(error){if(error.code===23)initiated=true;await client.close().catch(()=>{});client=new MongoClient('mongodb://127.0.0.1:'+port+'/admin?directConnection=true',{serverSelectionTimeoutMS:1000})}await new Promise(yes=>setTimeout(yes,200))}throw Error('Owned primary timeout')}
try{
 await mkdir(artifacts,{recursive:true});assert(!(await lstat(artifacts)).isSymbolicLink());await mkdir(fixture);await writeFile(join(fixture,'.owner'),owner,{flag:'wx'});owned=true;await mkdir(join(fixture,'data'))
 const binary=await realpath(resolve(root,binaryArg));assert(binary.startsWith(join(artifacts,'mongodb-portable','bin')+sep)&&basename(binary)==='mongod.exe')
 const port=await freePort();server=spawn(binary,['--bind_ip','127.0.0.1','--port',String(port),'--replSet','rs0','--dbpath',join(fixture,'data'),'--logpath',join(fixture,'mongod.log'),'--wiredTigerCacheSizeGB','0.25','--setParameter','diagnosticDataCollectionEnabled=false'],{cwd:fixture,windowsHide:true,stdio:'ignore'});await once(server,'spawn');client=new MongoClient('mongodb://127.0.0.1:'+port+'/admin?directConnection=true',{serverSelectionTimeoutMS:1000});await waitPrimary(port)
 const db=client.db(database);await db.collection('_FixtureOwnership').insertOne({_id:owner});await ensureMongoIndexes(db);const id=randomUUID();await db.collection('User').insertOne({_id:id,email:'owned-lock@fixture.invalid',revision:0,kyc_verified:false,verification_status:'unverified',createdAt:new Date(),updatedAt:new Date()})
 await db.command({profile:2,slowms:0})
 proxy=await startOwnedMongoLatencyProxy(port,0);const uri='mongodb://127.0.0.1:'+proxy.port+'/'+database+'?replicaSet=rs0&directConnection=true';prisma=new PrismaClient({datasources:{db:{url:uri}}});await prisma.$connect();await prisma.user.findUnique({where:{id},select:{id:true}});nativeProxy=new MongoClient(uri);await nativeProxy.db(database).command({ping:1});const extended=prisma.$extends({query:{$allOperations({args,query}){return query(args)}}})
 const active={AND:[{OR:[{closed_at:null},{closed_at:{isSet:false}}]},{OR:[{suspended_at:null},{suspended_at:{isSet:false}}]}]},data={revision:{increment:1}}
 proxy.setLatency(200)
 async function run(name,action){const start=new Date(),before={...proxy.stats},at=Date.now();let result='ok',errorCode;try{await action()}catch(error){result='error';errorCode=error.code??error.name}const elapsedMs=Date.now()-at;const rows=await db.collection('system.profile').find({ts:{$gte:start},ns:{$not:/system\.profile/}},{projection:{op:1,ns:1,command:1,millis:1}}).toArray();const commands={};for(const row of rows){const cmd=row.command??{},op=cmd.aggregate?'aggregate '+cmd.aggregate:cmd.find?'find '+cmd.find:cmd.update?'update '+cmd.update:cmd.commitTransaction?'commitTransaction':cmd.abortTransaction?'abortTransaction':row.op+' '+row.ns.split('.').at(-1);commands[op]=(commands[op]??0)+1}const row={name,result,errorCode,elapsedMs,clientFrames:proxy.stats.clientMessages-before.clientMessages,serverFrames:proxy.stats.serverMessages-before.serverMessages,commands};results.push(row);console.log(JSON.stringify(row))}
 if(!process.argv.includes('--raw-only')){
 await run('unextended updateMany active predicate',()=>prisma.$transaction(tx=>tx.user.updateMany({where:{id,...active},data}),{maxWait:5000,timeout:10000}))
 await run('unextended updateMany id only',()=>prisma.$transaction(tx=>tx.user.updateMany({where:{id},data}),{maxWait:5000,timeout:10000}))
 await run('unextended update active predicate select id',()=>prisma.$transaction(tx=>tx.user.update({where:{id,...active},data,select:{id:true}}),{maxWait:5000,timeout:10000}))
 await run('query extension update active predicate select id',()=>extended.$transaction(tx=>tx.user.update({where:{id,...active},data,select:{id:true}}),{maxWait:5000,timeout:10000}))
 await run('query extension updateMany active predicate',()=>extended.$transaction(tx=>tx.user.updateMany({where:{id,...active},data}),{maxWait:5000,timeout:10000}))
 }
 const rawActive={_id:id,closed_at:null,suspended_at:null}
 async function rawLock(tx,query=rawActive){return tx.$runCommandRaw({update:'User',updates:[{q:query,u:{$inc:{revision:1}},multi:false}]})}
 await run('raw command interactive transaction active predicate',()=>prisma.$transaction(async tx=>{const r=await rawLock(tx);assert.equal(r.n,1)},{maxWait:5000,timeout:10000}))
 await run('raw command forced rollback retains revision',async()=>{const before=await db.collection('User').findOne({_id:id},{projection:{revision:1}});await assert.rejects(prisma.$transaction(async tx=>{assert.equal((await rawLock(tx)).n,1);throw Error('OWNED_FORCED_ROLLBACK')},{timeout:10000}),{message:'OWNED_FORCED_ROLLBACK'});const after=await db.collection('User').findOne({_id:id},{projection:{revision:1}});assert.equal(after.revision,before.revision)})
 await run('raw command active predicate refuses closed account',async()=>{await db.collection('User').updateOne({_id:id},{$set:{closed_at:new Date()}});assert.equal((await prisma.$transaction(tx=>rawLock(tx),{timeout:10000})).n,0);await db.collection('User').updateOne({_id:id},{$unset:{closed_at:''}})})
 await run('raw command conflict classification',async()=>{let release,locked;const barrier=new Promise(r=>release=r),acquired=new Promise(r=>locked=r);const one=prisma.$transaction(async tx=>{assert.equal((await rawLock(tx)).n,1);locked();await barrier},{timeout:10000});await acquired;let rejection;try{await prisma.$transaction(tx=>rawLock(tx),{timeout:10000})}catch(error){rejection={code:error.code,metaCode:error.meta?.code,metaKeys:Object.keys(error.meta??{})}}release();await one;assert(rejection,'Competing raw writes must conflict');console.log(JSON.stringify({rawConflict:rejection}))})
 await run('native updateOne active predicate',async()=>{const session=nativeProxy.startSession();try{await session.withTransaction(()=>nativeProxy.db(database).collection('User').updateOne({_id:id,closed_at:null,suspended_at:null},{$inc:{revision:1}},{session}))}finally{await session.endSession()}})
 for(const row of results.filter(row=>row.name.startsWith('raw command')||row.name.startsWith('native ')))assert.equal(row.result,'ok',row.name+' regression')
 await writeFile(join(fixture,'report.json'),JSON.stringify({hostedDatabaseUsed:false,latencyEachDirectionMs:200,results},null,2));console.log('Evidence '+fixture)
}catch(error){process.exitCode=1;console.error('Owned benchmark failed',{name:error?.name,code:error?.code})}
finally{
 await prisma?.$disconnect().catch(()=>{});await nativeProxy?.close().catch(()=>{});await proxy?.close().catch(()=>{});try{await client?.db('admin').command({shutdown:1,force:true,timeoutSecs:3})}catch{}if(server?.exitCode===null){await Promise.race([once(server,'exit'),new Promise(yes=>setTimeout(yes,7000))]);if(server.exitCode===null)server.kill()}await client?.close().catch(()=>{});if(owned){assert(resolve(fixture).startsWith(artifacts+sep)&&!(await lstat(fixture)).isSymbolicLink()&&(await realpath(fixture)).toLowerCase()===fixture.toLowerCase()&&(await readFile(join(fixture,'.owner'),'utf8'))===owner);if(server&&server.exitCode===null&&server.signalCode===null)throw Error('Owned Mongo alive; preserving files');const dataPath=join(fixture,'data');assert(!(await lstat(dataPath)).isSymbolicLink()&&(await realpath(dataPath)).toLowerCase()===dataPath.toLowerCase());await rm(dataPath,{recursive:true,force:true})}
}
