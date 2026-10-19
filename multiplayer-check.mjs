import WebSocket from 'ws';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {judge} from './logic.js';
const base=process.env.TEST_URL||'ws://127.0.0.1:3000';
let agent;
if(process.env.TEST_PROXY){const {HttpsProxyAgent}=await import(process.env.PROXY_MODULE);agent=new HttpsProxyAgent(process.env.TEST_PROXY);}
const wait=async fn=>{const end=Date.now()+15000;while(Date.now()<end){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('Timeout');};
async function client(room){const c={id:randomUUID(),state:null,errors:[]};c.ws=new WebSocket(base+'/?room='+room,{agent});c.ws.on('message',data=>{const m=JSON.parse(data);if(m.type==='state')c.state=m;if(m.type==='error')c.errors.push(m.error);if(m.type==='joined')c.token=m.token;});await new Promise((ok,no)=>{c.ws.once('open',ok);c.ws.once('error',no);});c.send=m=>c.ws.send(JSON.stringify(m));return c;}
function candidates(n){const out=[];function add(s){if(s.length===n){out.push(s);return;}for(const x of '0123456789')if(!(s===''&&x==='0')&&!s.includes(x))add(s+x);}add('');return out;}
for(const digits of [4,5,6]){
 const room=randomUUID(),cs=[];
 // Open first socket but join it last: host follows join order, not page opening.
 for(let i=0;i<4;i++)cs.push(await client(room));
 for(const i of [1,0,2,3]){cs[i].send({type:'join',id:cs[i].id,nick:'테스트선수'+(i+1)});await wait(()=>cs[i].token);}
 await wait(()=>cs.every(c=>c.state?.members.length===4));
 assert.ok(cs.every(c=>c.state.host===cs[1].id));
 const extra=await client(room);extra.send({type:'join',id:extra.id,nick:'다섯째'});await wait(()=>extra.errors.length);extra.ws.close();
 cs[1].send({type:'config',digits});await wait(()=>cs.every(c=>c.state.digits===digits));
 cs[0].send({type:'start'});await wait(()=>cs[0].errors.length);
 cs[0].send({type:'chat',text:'대기실 채팅 확인'});await wait(()=>cs.every(c=>c.state.chat.length===1));
 cs[1].send({type:'start'});await wait(()=>cs.every(c=>c.state.game));
 assert.ok(cs.every(c=>c.state.game.answer===null));
 const old=cs[0].state.game.id;
 cs[0].send({type:'guess',value:'123456'.slice(0,digits),gameId:old,sequence:0});await wait(()=>cs[0].errors.length===2);
 cs[1].send({type:'guess',value:'1'.repeat(digits),gameId:old,sequence:0});await wait(()=>cs[1].errors.length);
 assert.equal(cs[1].state.game.history.length,0);
 cs[1].send({type:'pass',gameId:old,sequence:0});await wait(()=>cs.every(c=>c.state.game.history.length===1));
 let pool=candidates(digits),count=0;
 while(!cs[0].state.game.finished){
  const g=cs[0].state.game; const c=cs.find(c=>c.id===g.turn),guess=pool[0],seq=g.history.length;
  c.send({type:'guess',value:guess,gameId:g.id,sequence:seq});await wait(()=>cs.every(c=>c.state.game.history.length===seq+1));
  const result=cs[0].state.game.history.at(-1);
  pool=pool.filter(s=>{const r=judge(s,guess);return r.strikes===result.strikes&&r.balls===result.balls;});
  assert.ok(pool.length);if(++count>30)throw Error('solver');
  await new Promise(r=>setTimeout(r,120));
 }
 assert.ok(cs.every(c=>c.state.game.winner&&c.state.game.answer===pool[0]));
 cs[2].send({type:'chat',text:'종료 후 채팅 확인'});await wait(()=>cs.every(c=>c.state.chat.length===2));
 cs[1].send({type:'rematch'});await wait(()=>cs.every(c=>c.state.game.id!==old));
 assert.ok(cs.every(c=>!c.state.game.finished&&c.state.game.history.length===0&&c.state.members.length===4&&c.state.chat.length===2));
 // Host disconnect transfers leadership and skips disconnected turn.
 cs[1].ws.close();await wait(()=>cs[0].state.host===cs[0].id&&cs[0].state.game.turn===cs[0].id);
 for(const c of cs)c.ws.close();
 console.log(`PASS ${digits} digits: 4 simultaneous clients, first join host, cap, permissions, validation, turns, pass, win, chat, rematch, disconnect (${count} guesses)`);
}
