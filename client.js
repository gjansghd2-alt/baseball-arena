// Application heartbeat also works through proxies that answer protocol pings.
function attachClientHeartbeat(socket) {
  let lastSeen=Date.now();
  const beat=()=>{if(Date.now()-lastSeen>60000){socket.close();return;}if(socket.readyState===1)socket.send(JSON.stringify({type:'heartbeat'}));};
  socket.addEventListener('open',()=>{lastSeen=Date.now();beat();});
  socket.addEventListener('message',()=>{lastSeen=Date.now();});
  const timer=setInterval(beat,20000);
  socket.addEventListener('close',()=>clearInterval(timer),{once:true});
}
const $=s=>document.querySelector(s);
let room=new URLSearchParams(location.search).get('room');
if(!room){room=crypto.randomUUID();history.replaceState(null,'','?room='+room);}
$('#invite').value=location.href;
const key='baseball-'+room;
function readSaved(k){try{return JSON.parse(localStorage.getItem(k)||sessionStorage.getItem(k)||'null')}catch{return null}}
function writeSaved(k,v){const data=JSON.stringify(v);try{localStorage.setItem(k,data)}catch{}try{sessionStorage.setItem(k,data)}catch{}}
let credentials=readSaved(key);
if(!credentials||typeof credentials.id!=='string')credentials={id:crypto.randomUUID()};
writeSaved(key,credentials);
if(credentials.nick)$('#nick').value=credentials.nick;
let ws,joined=false,state=null,pendingDigits=null,pendingMode=null,wantJoin=!!credentials.token,round=null;
const notice=t=>$('#notice').textContent=t;
function send(m){if(ws?.readyState===1)ws.send(JSON.stringify(m));else notice('구장에 다시 연결 중이에요.');}
function connect(){
  ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/?room='+room);attachClientHeartbeat(ws);
  ws.onopen=()=>{$('#join').disabled=wantJoin;if(wantJoin)$('#status').textContent='기존 참가자로 복귀 중…';if(wantJoin)send({type:'join',...credentials,nick:$('#nick').value});else $('#status').textContent='닉네임을 입력하고 입장하세요.';};
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='joined'){joined=true;wantJoin=true;credentials.token=m.token;credentials.nick=$('#nick').value;writeSaved(key,credentials);$('#join').disabled=true;}else if(m.type==='error'){notice(m.error);if(!joined)$('#join').disabled=false;}else if(m.type==='state'){if(!state&&m.host===credentials.id&&!m.game&&(pendingDigits!==null||pendingMode!==null))send({type:'config',...(pendingDigits!==null?{digits:pendingDigits}:{}),...(pendingMode!==null?{mode:pendingMode}:{})});render(m);}};
  ws.onclose=e=>{$('#join').disabled=true;$('#submit').disabled=true;$('#pass').disabled=true;$('#start').disabled=true;$('#sendChat').disabled=true;if(e.reason==='Reconnected'){notice('다른 창에서 재접속했어요. 이 창은 닫아주세요.');return;}$('#status').textContent=e.code===1008?'초대 링크를 다시 확인해주세요.':'연결이 끊겨 재접속 중…';if(e.code!==1008)setTimeout(connect,2000);};
}
function render(m){
  state=m;const g=m.game,host=m.host===credentials.id,myTurn=!!g&&g.phase==='playing'&&!g.finished&&g.turn===credentials.id;const duel=m.mode==='duel';
  if(round!==(g?.id||null)){round=g?.id||null;$('#guess').value='';$('#mySecret').value='';notice('');}
  $('#boardLabel').textContent=duel?'OPPONENT NUMBER · 상대의 비밀 숫자':'SECRET NUMBER';$('#ruleList').replaceChildren(...(duel?['각자 중복 없는 비밀 숫자를 정해요.','둘 다 확정하면 입장 순서대로 시작해요.','번갈아 상대 숫자를 한 번씩 추측해요.','먼저 상대 숫자를 모두 맞히면 승리!']:['방장이 4·5·6자리 중 선택해요.','입장 순서대로 한 번씩 추측해요.','앞선 판정을 보고 다음 수를 생각해요.','먼저 모두 맞히면 홈런, 승리!']).map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));$('#mode').value=m.mode;$('#mode').disabled=!host||!!g;$('#modeHelp').textContent=duel?'각자 비밀 숫자를 정하고 번갈아 상대 숫자를 추리합니다. 먼저 맞히면 승리!':'같은 정답을 추리해 먼저 맞히면 승리!';$('#digits').value=m.digits;$('#digits').disabled=!host||!!g;$('#guess').maxLength=m.digits;$('#guess').placeholder=`숫자 ${m.digits}자리`;
  $('#start').disabled=!host||!!g||m.members.filter(p=>p.online).length<2;$('#secretPanel').classList.toggle('hidden',!g||!duel||g.finished);$('#mySecret').maxLength=m.digits;$('#mySecret').disabled=!!g?.ownSecret;$('#setSecret').disabled=!!g?.ownSecret;$('#secretHelp').textContent=g?.ownSecret?'내 비밀 숫자 확정 완료. 상대에게는 공개되지 않습니다.':'확정한 뒤에는 변경할 수 없어요. 상대에게는 공개되지 않습니다.';$('#readyStatus').textContent=duel&&g?m.members.map(p=>p.nick+': '+(g.ready.includes(p.id)?'숫자 확정':'숫자 설정 중')).join(' · '):'';
  $('#chat').disabled=!joined;$('#sendChat').disabled=!joined;$('#guess').disabled=!myTurn;$('#submit').disabled=!myTurn;$('#pass').disabled=!myTurn;
  $('#status').textContent=(g?g.finished?'경기 종료':'경기 중':'대기실')+' · '+m.members.filter(p=>p.online).length+(duel?'/2명':'/4명')+(host?' · 내가 방장입니다':' · 방장이 경기를 준비합니다');
  $('#inning').textContent=g?g.finished?'HOME RUN!':g.phase==='setup'?'SET YOUR NUMBER':'TURN '+(g.history.length+1):'WAITING ROOM';
  $('#secret').replaceChildren(...Array.from({length:m.digits},(_,i)=>{const el=document.createElement('span');el.textContent=g?.answer?.[i]||'?';return el;}));
  $('#players').replaceChildren(...m.members.map((p,i)=>{const el=document.createElement('div');el.className='player'+(g&&!g.finished&&g.turn===p.id?' active':'');const num=document.createElement('span');num.className='jersey';num.textContent=String(i+1).padStart(2,'0');const name=document.createElement('strong');name.textContent=p.nick+(p.id===credentials.id?' (나)':'');const info=document.createElement('small');info.textContent=!p.online?'연결 끊김':p.id===m.host?'방장 · 접속 중':'접속 중';el.append(num,name,info);return el;}));
  const player=m.members.find(p=>p.id===g?.turn);
  $('#turn').textContent=!g?'선수들의 입장을 기다립니다':g.finished?'홈런! 경기가 끝났습니다':g.phase==='setup'?'각자의 비밀 숫자를 정해주세요':myTurn?'내 차례 · 타석에 입장!':(player?.nick||'선수')+'의 타석';
  $('#turnHelp').textContent=!g?'2명 이상 입장하면 방장이 경기를 시작할 수 있어요.':g.finished?'아래 결과를 확인하고 다음 경기를 준비하세요.':g.phase==='setup'?'두 선수 모두 확정하면 첫 번째 선수부터 시작합니다.':myTurn?'시간제한 없이 생각하세요. 준비되면 스윙!':'공개 기록을 보며 다음 추측을 준비하세요. 시간제한은 없어요.';
  $('#victory').classList.toggle('hidden',!g?.finished);$('#winner').textContent=g?.finished?(m.members.find(p=>p.id===g.winner)?.nick||'선수')+' 승리!':'';
  $('#rematch').classList.toggle('hidden',!host);$('#lobby').classList.toggle('hidden',!host);
  const hist=g?.history||[];$('#attempts').textContent=hist.filter(x=>!x.pass).length+'회';$('#empty').classList.toggle('hidden',!!hist.length);$('#historyTable').classList.toggle('hidden',!hist.length);
  $('#history').replaceChildren(...hist.map((h,i)=>{const tr=document.createElement('tr');for(const text of [i+1,h.nick,h.pass?'—':h.guess]){const td=document.createElement('td');td.textContent=text;tr.append(td);}const result=document.createElement('td');if(h.pass)result.textContent='차례 넘김';else{for(const [text,color]of(h.strikes||h.balls?[[h.strikes+' S','s'],[h.balls+' B','b']]:[['OUT','o']])){const badge=document.createElement('span');badge.className='pill '+color;badge.textContent=text;result.append(badge);}}tr.append(result);return tr;}).reverse());
  const log=$('#chatlog'),nearBottom=log.scrollHeight-log.scrollTop-log.clientHeight<60;
  log.replaceChildren(...m.chat.map(c=>{const div=document.createElement('div');div.className='message';const nick=document.createElement('b');nick.textContent=c.nick;const text=document.createElement('span');text.textContent=c.text;div.append(nick,text);return div;}));if(nearBottom)log.scrollTop=log.scrollHeight;
}
$('#join').onclick=()=>{if(!$('#nick').value.trim()){$('#nick').focus();notice('닉네임을 입력해주세요.');return;}send({type:'join',...credentials,nick:$('#nick').value});};
$('#nick').onkeydown=e=>{if(e.key==='Enter'&&!$('#join').disabled)$('#join').click();};
$('#digits').onchange=()=>{pendingDigits=Number($('#digits').value);if(joined)send({type:'config',digits:pendingDigits});else{$('#guess').placeholder=`숫자 ${pendingDigits}자리`;$('#secret').replaceChildren(...Array.from({length:pendingDigits},()=>{const el=document.createElement('span');el.textContent='?';return el;}));}};
$('#mode').onchange=()=>{pendingMode=$('#mode').value;if(joined)send({type:'config',mode:pendingMode});};
$('#secretForm').onsubmit=e=>{e.preventDefault();if(!state?.game||$('#setSecret').disabled)return;notice('');send({type:'secret',value:$('#mySecret').value.trim(),gameId:state.game.id});};
$('#start').onclick=()=>send({type:'start'});$('#rematch').onclick=()=>send({type:'rematch'});$('#lobby').onclick=()=>send({type:'lobby'});
$('#guessForm').onsubmit=e=>{e.preventDefault();if($('#submit').disabled)return;const value=$('#guess').value.trim(),digits=state.digits;if(!new RegExp('^[1-9][0-9]{'+(digits-1)+'}$').test(value)||new Set(value).size!==digits){notice(`중복 없는 ${digits}자리 숫자를 입력하세요. 첫 자리는 0이 아니에요.`);return;}notice('');send({type:'guess',value,gameId:state.game.id,sequence:state.game.history.length});$('#guess').value='';};
$('#pass').onclick=()=>{notice('');send({type:'pass',gameId:state.game.id,sequence:state.game.history.length});};
$('#chatForm').onsubmit=e=>{e.preventDefault();if(!joined)return;send({type:'chat',text:$('#chat').value});$('#chat').value='';};
$('#copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);$('#copy').textContent='복사 완료!';}catch{$('#invite').select();notice('위 초대 링크를 길게 눌러 복사해주세요.');}};
// Private notes stay on this browser and never enter WebSocket messages.
const notesKey=key+'-notes-'+credentials.id;
const notesInput=$('#privateNotes');
const savedNotes=readSaved(notesKey);
notesInput.value=typeof savedNotes==='string'?savedNotes.slice(0,5000):'';
let erasedNotes=null;
function saveNotes(){
  const value=notesInput.value;
  writeSaved(notesKey,value);
  let persisted=false,temporary=false;
  try{persisted=localStorage.getItem(notesKey)===JSON.stringify(value)}catch{}
  try{temporary=sessionStorage.getItem(notesKey)===JSON.stringify(value)}catch{}
  $('#notesStatus').textContent=persisted?'이 기기에 저장됨':temporary?'이 탭에서만 저장됨':'저장 불가 · 창을 닫으면 사라져요';
  $('#clearNotes').disabled=!value;
}
$('#clearNotes').disabled=!notesInput.value;
notesInput.addEventListener('input',()=>{erasedNotes=null;$('#undoNotes').classList.add('hidden');saveNotes();});
$('#clearNotes').onclick=()=>{if(!notesInput.value)return;erasedNotes=notesInput.value;notesInput.value='';saveNotes();$('#undoNotes').classList.remove('hidden');notesInput.focus();};
$('#undoNotes').onclick=()=>{if(erasedNotes===null)return;notesInput.value=erasedNotes;erasedNotes=null;saveNotes();$('#undoNotes').classList.add('hidden');notesInput.focus();};
connect();
