import {SECRETS} from '../data/secrets.js';
import {markCollection} from './collection.js';
import {logGood} from './log.js';

export function discover(state,id) {
 if((state.collection?.secrets || []).includes(id))return false;
 const secret=SECRETS.find(x=>x.id===id);
 if(!secret)return false;
 markCollection(state,'secrets',id);
 logGood(state,`两界录 · 发现「${secret.name}」：${secret.note}`);
 return true;
}
export function discoverResearch(state) {
 if(state.modern.job==='dev' && state.player.stage>=18 && state.research.done.meridian)discover(state,'compiler');
}
export function discoverDungeon(state,id) {
 if(id==='ruins' && state.inventory.some(e=>e.itemId==='jingmi' && e.qty>0))discover(state,'signal');
 const hour=new Date(state.world.clockMs+8*3600000).getUTCHours();
 if(id==='starfall' && (state.companions.bailing?.affection || 0)>=40 && (hour>=20 || hour<5))discover(state,'night');
}
