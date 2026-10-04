// Opt-in disposable QA only. Seed and cleanup remain administrative operations.
const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
(async()=>{
 assert(process.env.MOXIU_QA_FILE,'Provide one disposable depth QA account');
 const u=JSON.parse(fs.readFileSync(process.env.MOXIU_QA_FILE,'utf8'));assert(u.email.startsWith('qa-depth-') && u.email.endsWith('@example.invalid'));
 const url='https://zqgcijakvjzvvtecdacj.supabase.co',apikey='sb_publishable_RZj01InnTXgoan6DkDqBoQ_-PJ6zDZN';let session,game,checks=0;
 const check=(v,msg)=>{assert(v,msg);checks++;};
 const request=async(path,body)=>{const r=await fetch(url+path,{method:'POST',headers:{apikey,'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.access_token}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>null)};};
 try {
  const login=await request('/auth/v1/token?grant_type=password',{email:u.email,password:u.password});assert.equal(login.status,200,'disposable login');session=login.data;
  const sync=await request('/functions/v1/moxiu-game',{action:'sync',args:[]});assert.equal(sync.status,200);game=sync.data;
  const cmd=async(action,args=[])=>{const body={action,args,revision:game.revision,request_id:randomUUID()},r=await request('/functions/v1/moxiu-game',body);assert.equal(r.status,200,'actual command '+action);game=r.data;return {...r,body};};
  let r=await cmd('build.selectBuild',['poison']);check(r.data.result.ok && game.state.player.build==='poison','actual server selects qualified routine');
  r=await cmd('build.selectBuild',['tech']);check(!r.data.result.ok && game.state.player.build==='poison','actual server refuses forged prerequisites');
  const stone=game.state.currency.stone;
  r=await cmd('build.inscribeAffix',['qa-depth-artifact','shanggu']);check(r.data.result.ok && game.state.currency.stone===stone-1000,'actual inscription exact charge');
  const replay=await request('/functions/v1/moxiu-game',r.body);check(replay.data.replayed && replay.data.state.currency.stone===stone-1000,'actual replay cannot charge again');
  check(game.state.inventory.find(e=>e.itemId==='lingjin')?.qty===2 && game.state.bag.find(e=>e.uid==='qa-depth-artifact').rule==='shanggu','actual recipe consumes two lingjin');
  r=await cmd('gear.equipItem',['qa-depth-artifact']);check(r.data.result.ok && game.state.equipment.artifact.rule==='shanggu','actual engraved equipment equips');
  r=await cmd('gear.useConsumable',['shilingdan']);check(r.data.result.ok && game.state.player.buffs.some(b=>b.id==='poison_pill') && !game.state.inventory.some(e=>e.itemId==='shilingdan'),'actual pill creates buff and consumes inventory');
  r=await cmd('tales.followStory',['other_crosser']);check(r.data.result.ok && game.state.tales.pending?.id==='crosser_water','actual server opens qualified mainline');
  r=await cmd('tales.resolveTale',[0]);check(r.data.result.ok && game.state.tales.flags.crosser_route==='open' && !game.state.tales.pending,'actual main choice persists');
  r=await request('/functions/v1/moxiu-game',{action:'build.inscribeAffix',args:['qa-depth-artifact','shanggu',{reward:999999}],revision:game.revision,request_id:randomUUID()});check(r.status===400,'actual endpoint rejects extra reward payload');
  console.log(JSON.stringify({passed:checks}));
 }finally{if(session)await request('/auth/v1/logout',{scope:'global'});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
