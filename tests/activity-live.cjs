// Opt-in only: two disposable accounts, deleted after the run; never use a player account.
const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
(async()=>{
 assert(process.env.MOXIU_QA_FILE,'Provide disposable activity QA accounts');
 const users=JSON.parse(fs.readFileSync(process.env.MOXIU_QA_FILE,'utf8'));assert.equal(users.length,2);assert(users.every(x=>x.email.startsWith('qa-activity-')&&x.email.endsWith('@example.invalid')));
 const url='https://zqgcijakvjzvvtecdacj.supabase.co',key='sb_publishable_RZj01InnTXgoan6DkDqBoQ_-PJ6zDZN',checks=[];
 const check=(x,label)=>{assert(x,label);checks.push(label);};
 for(const u of users){const r=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:u.email,password:u.password})});assert.equal(r.status,200,'temporary QA login');u.session=await r.json();}
 const request=async(u,path,body)=>{const r=await fetch(url+path,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',Authorization:'Bearer '+u.session.access_token},body:JSON.stringify(body)});const text=await r.text();return{status:r.status,data:text?JSON.parse(text):null};};
 const rpc=(u,fn,action,data={})=>request(u,'/rest/v1/rpc/'+fn,{p_action:action,p_data:data});
 const sync=async u=>{const r=await request(u,'/functions/v1/moxiu-game',{action:'sync',args:[]});assert.equal(r.status,200,'actual Edge sync');u.game=r.data;return r;};
 const command=async(u,action,args=[])=>{const body={action,args,request_id:randomUUID(),revision:u.game.revision};const r=await request(u,'/functions/v1/moxiu-game',body);assert.equal(r.status,200,JSON.stringify(r.data));u.game=r.data;return {body,...r};};
 const[a,b]=users;for(const u of users){await sync(u);u.uid=(await rpc(u,'moxiu_chat','read')).data.self.uid;}
 const stone=a.game.state.currency.stone;
 let r=await command(a,'daily.signIn');check(r.data.result.ok&&r.data.state.currency.stone===stone+20,'actual Edge grants exactly 20 stone');
 let replay=await request(a,'/functions/v1/moxiu-game',r.body);check(replay.data.replayed&&replay.data.state.currency.stone===stone+20,'actual sign in retry cannot mint funds');
 const other=await command(a,'daily.signIn');check(other.data.result.ok===false,'new request on same account day is rejected');
 await command(a,'reset');r=await command(a,'daily.signIn');check(r.data.result.ok===false&&r.data.state.daily.signInTotal===1,'actual cleared character cannot sign in twice');
 r=await rpc(a,'moxiu_social','request',{uid:b.uid});check(r.status===200,'actual friend request');
 r=await rpc(b,'moxiu_social','read');const incoming=r.data.incoming.find(x=>x.uid===a.uid);assert(incoming);
 r=await rpc(b,'moxiu_social','accept',{id:incoming.id});check(r.status===200&&r.data.friends.some(x=>x.uid===a.uid),'actual friend acceptance');
 r=await rpc(a,'moxiu_social','help',{uid:b.uid});check(r.status===200&&r.data.friends.find(x=>x.uid===b.uid).help_sent,'actual care send recorded on card');
 r=await rpc(a,'moxiu_social','help',{uid:b.uid});check(r.status===200,'actual care send retry is idempotent');
 await sync(b);check(b.game.state.daily.help?.author_name==='照料联测','actual recipient sees offline care on home state');
 const readyAt=b.game.state.farm.plots[0].readyAt;
 r=await command(b,'daily.claimHelp');check(r.data.result.ok&&r.data.state.farm.plots[0].readyAt===readyAt-300000,'actual server care advances a crop by five minutes');
 replay=await request(b,'/functions/v1/moxiu-game',r.body);check(replay.data.replayed&&replay.data.state.farm.plots[0].readyAt===readyAt-300000,'actual care retry does not accelerate again');
 r=await command(b,'daily.claimHelp');check(r.data.result.ok===false,'actual care cannot be consumed twice');
 await rpc(b,'moxiu_shards','equip',{sku:'title_first_cross'});
 r=await rpc(a,'moxiu_social','read');const card=r.data.friends.find(x=>x.uid===b.uid);check(card.title?.name==='界门初开'&&Number.isInteger(card.stage)&&!card.email&&!card.user_id,'actual friend card exposes title and progress without private account fields');
 r=await command(b,'commissions.acceptCommission',['breakfast-eggs']);check(r.data.result.ok&&r.data.state.commissions.active.some(x=>x.id==='breakfast-eggs'&&x.reward===160),'actual cross-world commission accepts and locks payout');
 r=await request(a,'/functions/v1/moxiu-game',{action:'daily.signIn',args:[{reward:10000}],request_id:randomUUID(),revision:a.game.revision});check(r.status===400,'actual Edge rejects client reward injection');
 r=await request(a,'/rest/v1/rpc/moxiu_game_commit_v2',{p_user:a.id,p_revision:a.game.revision,p_request:randomUUID(),p_action:'daily.signIn',p_args:[],p_state:a.game.state,p_result:{ok:true},p_projection:{}});check(r.status===401||r.status===403,'actual client cannot bypass trusted settlement');
 for(const u of users)await request(u,'/auth/v1/logout',{scope:'global'});
 console.log(JSON.stringify({passed:checks.length,checks}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
