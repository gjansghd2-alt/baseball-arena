import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {attachHeartbeat} from './heartbeat.js';
test('heartbeat preserves responsive sockets, terminates silent peers, isolates errors', t => {
  t.mock.timers.enable({apis:['setInterval']});
  const wss=new EventEmitter();wss.clients=new Set();
  const socket=()=>Object.assign(new EventEmitter(),{readyState:1,pings:0,dead:false,ping(){this.pings++;},terminate(){this.dead=true;}});
  const alive=socket(),silent=socket();wss.clients.add(alive);wss.clients.add(silent);
  attachHeartbeat(wss,30);wss.emit('connection',alive);wss.emit('connection',silent);
  t.mock.timers.tick(30);assert.equal(alive.pings,1);alive.emit('pong');
  assert.doesNotThrow(()=>silent.emit('error',new Error('transport error')));
  t.mock.timers.tick(30);assert.equal(alive.dead,false);assert.equal(silent.dead,true);
  wss.emit('close');t.mock.timers.tick(60);assert.equal(alive.pings,2);
});
