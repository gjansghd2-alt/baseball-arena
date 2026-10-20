import {attachHeartbeat} from './heartbeat.js';
import http from 'node:http';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { answer,valid,judge } from './logic.js';

const rooms=new Map();
const server=http.createServer(async(req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;
  if(p==='/health'){res.writeHead(200,{'Content-Type':'application/json'}).end('{"ok":true}');return;}
  const files={'/':'index.html','/index.html':'index.html','/client.js':'client.js','/style.css':'style.css'};
  if(!files[p]){res.writeHead(404).end();return;}
  try{const data=await fs.readFile(new URL(files[p],import.meta.url));res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-cache');res.end(data);}catch{res.writeHead(500).end();}
});
const wss=new WebSocketServer({server,maxPayload:4096});attachHeartbeat(wss);
const send=(ws,data)=>{if(ws.readyState===1)ws.send(JSON.stringify(data));};
const online=(r,id)=>[...r.clients].some(c=>c.pid===id&&c.readyState===1);
function broadcast(r){
  for(const ws of r.clients) if(ws.pid) send(ws,{type:'state',host:r.host,digits:r.digits,mode:r.mode,members:[...r.members].map(([id,p])=>({id,nick:p.nick,online:online(r,id)})),chat:r.chat,game:r.game?{id:r.game.id,mode:r.game.mode,phase:r.game.phase,ready:Object.keys(r.game.secrets),ownSecret:r.game.secrets[ws.pid]||null,players:r.game.players,turn:r.game.turn,history:r.game.history,finished:r.game.finished,winner:r.game.winner,answer:r.game.finished?(r.game.mode==='duel'?r.game.secrets[r.game.players.find(id=>id!==ws.pid)]:r.game.answer):null}:null});
}
function advance(r){const g=r.game;const current=g.players.indexOf(g.turn);for(let k=1;k<=g.players.length;k++){const id=g.players[(current+k)%g.players.length];if(online(r,id)){g.turn=id;return;}}g.turn=null;}
function start(r){
  const players=[...r.members.keys()].filter(id=>online(r,id));
  if(players.length<2)throw Error('2명 이상 입장해야 시작할 수 있어요.');
  if(r.mode==='duel'&&players.length!==2)throw Error('비밀 숫자 대결은 정확히 2명이 입장해야 해요.');
  for(const id of r.members.keys())if(!online(r,id))r.members.delete(id);
  r.game={id:randomUUID(),mode:r.mode,phase:r.mode==='duel'?'setup':'playing',secrets:{},players,turn:players[0],answer:r.mode==='duel'?null:answer(r.digits),history:[],finished:false,winner:null};
}
wss.on('connection',(ws,req)=>{
  const rid=new URL(req.url,'http://localhost').searchParams.get('room');
  if(!rid||!/^[\w-]{10,80}$/.test(rid)){ws.close(1008);return;}
  let r=rooms.get(rid);
  if(!r){if(rooms.size>=1000){ws.close(1013);return;}r={clients:new Set(),members:new Map(),host:null,digits:4,mode:'shared',game:null,chat:[],last:Date.now()};rooms.set(rid,r);}
  r.clients.add(ws);
  ws.on('message',raw=>{try{
    const now=Date.now();if(now-(ws.window||0)>1000){ws.window=now;ws.count=0;}if(++ws.count>20)throw Error('잠시 후 다시 시도하세요.');
    const m=JSON.parse(raw);if(m?.type==='heartbeat'){send(ws,{type:'heartbeat'});return;}
    if(m.type==='join'){
      if(ws.pid)throw Error('이미 입장했어요.');
      if(typeof m.id!=='string'||!/^[\w-]{16,80}$/.test(m.id))throw Error('잘못된 참가자입니다.');
      const previous=r.members.get(m.id);
      if(previous){if(previous.token!==m.token)throw Error('재접속 인증에 실패했어요.');ws.pid=m.id;for(const c of r.clients)if(c!==ws&&c.pid===m.id)c.close(1000,'Reconnected');}
      else {if(r.game&&!r.game.finished)throw Error('경기 중인 방이에요. 다음 경기를 기다려주세요.');if(r.members.size>=(r.mode==='duel'?2:4))throw Error(r.mode==='duel'?'비밀 숫자 대결은 최대 2명입니다.':'방이 가득 찼어요. 최대 4명입니다.');r.members.set(m.id,{nick:String(m.nick||'선수').trim().slice(0,16)||'선수',token:randomUUID()});ws.pid=m.id;}
      if(!r.host)r.host=ws.pid;
      if(r.game&&!r.game.finished&&!r.game.turn&&r.game.players.includes(ws.pid))r.game.turn=ws.pid;
      send(ws,{type:'joined',token:r.members.get(ws.pid).token});
    }else{
      if(!ws.pid)throw Error('먼저 입장해주세요.');
      if(m.type==='config'){if(ws.pid!==r.host||r.game)throw Error('방장만 대기실에서 변경할 수 있어요.');if(m.digits!==undefined){if(![4,5,6].includes(m.digits))throw Error('4~6자리 중 선택해주세요.');r.digits=m.digits;}if(m.mode!==undefined){if(!['shared','duel'].includes(m.mode))throw Error('잘못된 모드입니다.');if(m.mode==='duel'&&r.members.size>2)throw Error('비밀 숫자 대결은 2명인 방에서 선택해주세요.');r.mode=m.mode;}}
      else if(m.type==='start'||m.type==='rematch'){if(ws.pid!==r.host||(r.game&&!r.game.finished))throw Error('방장만 경기를 시작할 수 있어요.');start(r);}
      else if(m.type==='lobby'){if(ws.pid!==r.host||!r.game?.finished)throw Error('경기 종료 후 방장만 변경할 수 있어요.');r.game=null;for(const id of r.members.keys())if(!online(r,id))r.members.delete(id);}
      else if(m.type==='secret'){
        const g=r.game;if(!g||g.mode!=='duel'||g.phase!=='setup'||!g.players.includes(ws.pid)||m.gameId!==g.id)throw Error('비밀 숫자를 정할 수 없는 상태예요.');if(g.secrets[ws.pid])throw Error('확정한 숫자는 바꿀 수 없어요.');if(!valid(m.value,r.digits))throw Error(`중복 없이 ${r.digits}자리 숫자를 입력하세요. 첫 자리는 0이 아니에요.`);g.secrets[ws.pid]=m.value;if(g.players.every(id=>g.secrets[id]))g.phase='playing';
      }else if(m.type==='guess'||m.type==='pass'){
        const g=r.game;if(!g||g.finished||g.phase!=='playing')throw Error('두 선수 모두 비밀 숫자를 확정한 뒤 진행할 수 있어요.');if(g.turn!==ws.pid)throw Error('아직 내 차례가 아니에요.');if(m.gameId!==g.id||m.sequence!==g.history.length)throw Error('차례가 바뀌었어요. 다시 확인해주세요.');
        if(m.type==='guess'){if(!valid(m.value,r.digits))throw Error(`중복 없이 ${r.digits}자리 숫자를 입력하세요. 첫 자리는 0이 아니에요.`);const target=g.mode==='duel'?g.secrets[g.players.find(id=>id!==ws.pid)]:g.answer;const result=judge(target,m.value);g.history.push({player:ws.pid,nick:r.members.get(ws.pid).nick,guess:m.value,...result});if(result.strikes===r.digits){g.finished=true;g.winner=ws.pid;}}
        else g.history.push({player:ws.pid,nick:r.members.get(ws.pid).nick,pass:true});
        if(!g.finished){if(g.mode==='duel')g.turn=g.players.find(id=>id!==ws.pid);else advance(r);}
      }else if(m.type==='chat'){const text=String(m.text||'').trim().slice(0,300);if(text){r.chat.push({nick:r.members.get(ws.pid).nick,text});r.chat=r.chat.slice(-100);}}
    }
    r.last=Date.now();broadcast(r);
  }catch(e){send(ws,{type:'error',error:e.message});}});
  ws.on('close',()=>{
    r.clients.delete(ws);
    if(ws.pid&&!online(r,ws.pid)){
      if(!r.game)r.members.delete(ws.pid);
      if(r.host===ws.pid)r.host=[...r.members.keys()].find(id=>online(r,id))||null;
      if(r.game&&!r.game.finished&&r.game.mode!=='duel'&&r.game.turn===ws.pid)advance(r);
    }
    r.last=Date.now();broadcast(r);
  });
});
setInterval(()=>{for(const[id,r]of rooms)if(!r.clients.size&&Date.now()-r.last>3600000)rooms.delete(id);},60000).unref();
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Baseball Arena ready'));
