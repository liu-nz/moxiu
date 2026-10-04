const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>main(JSON.parse(input)).catch(e=>{console.error(e.message);process.exitCode=1;}));
async function main(u){
 assert(u.email.startsWith('qa-discovery-') && u.email.endsWith('@example.invalid'));
 const url='https://zqgcijakvjzvvtecdacj.supabase.co',apikey='sb_publishable_RZj01InnTXgoan6DkDqBoQ_-PJ6zDZN';let session,game,checks=0;
 const check=(v,msg)=>{assert(v,msg);checks++;};
 const request=async(path,body)=>{const r=await fetch(url+path,{method:'POST',headers:{apikey,'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.access_token}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>null)};};
 try{
  const login=await request('/auth/v1/token?grant_type=password',{email:u.email,password:u.password});assert.equal(login.status,200,'QA login');session=login.data;
  let r=await request('/functions/v1/moxiu-game',{action:'sync',args:[]});assert.equal(r.status,200);game=r.data;
  check(game.state.collection.secrets.includes('compiler'),'production sync discovers compiler from canonical job and research');
  const cmd=async(action,args=[])=>{const body={action,args,revision:game.revision,request_id:randomUUID()},r=await request('/functions/v1/moxiu-game',body);assert.equal(r.status,200,'command '+action);game=r.data;return {...r,body};};
  r=await cmd('research.doResearch',['compiler']);check(r.data.result.ok && game.state.research.points<221,'hidden research charges points on production');
  r=await request('/functions/v1/moxiu-game',r.body);check(r.data.replayed && r.data.state.research.points===game.state.research.points,'research receipt replay does not charge again');
  r=await cmd('forging.forge',['design_qingsui','armor']);check(!r.data.result.ok && game.state.inventory.find(x=>x.itemId==='yinjing').qty===10,'wrong blueprint slot rejected without material debit');
  let forged;for(let i=0;i<4;i++){r=await cmd('forging.forge',['design_qingsui','weapon']);if(r.data.result.success){forged=r;break;}}
  check(forged && game.state.collection.designs.includes('qingsui'),'production forge grants named gear and discovery');
  const gearCount=game.state.bag.length;r=await request('/functions/v1/moxiu-game',forged.body);check(r.data.replayed && r.data.state.bag.length===gearCount,'forge receipt replay does not duplicate gear');
  r=await cmd('tales.followStory',['workshop_after']);check(r.data.result.ok && game.state.tales.pending.id==='workshop_after_start','production NPC relationship opens followup');
  r=await cmd('tales.resolveTale',[1]);check(r.data.result.ok && game.state.tales.flags.workshop_after_route==='robe','NPC branch choice persisted');
  r=await cmd('dungeon.runDungeon',['ruins','normal']);check(r.data.result.ok && r.data.result.win && game.state.collection.secrets.includes('signal'),'actual ruins win with modern tool discovers signal');
  r=await cmd('alchemy.craft',['huiyuan',20]);check(r.data.result.ok && game.state.inventory.some(x=>x.itemId==='fanzhao'),'production failures reveal one mutation');
  const qty=game.state.inventory.find(x=>x.itemId==='fanzhao').qty;
  r=await cmd('trade.buyConsumable',['fanzhao']);check(!r.data.result.ok && game.state.inventory.find(x=>x.itemId==='fanzhao').qty===qty,'production rejects free purchase of mutation');
  r=await cmd('gear.useConsumable',['fanzhao']);check(r.data.result.ok && game.state.player.buffs.some(x=>x.sourceItem==='fanzhao'),'mutation consumption produces actual buff');
  r=await request('/functions/v1/moxiu-game',{action:'collection.markCollection',args:['secrets','night'],revision:game.revision,request_id:randomUUID()});check(r.status===400,'production rejects direct discovery grant');
  console.log(JSON.stringify({passed:checks}));
 }finally{if(session)await request('/auth/v1/logout',{scope:'global'});}
}
