import test from 'node:test';
import assert from 'node:assert/strict';
import {answer,judge,valid} from './logic.js';
test('4–6자리 무중복 정답과 첫 자리 규칙',()=>{for(const n of [4,5,6])for(let i=0;i<100;i++)assert.ok(valid(answer(n),n));for(const v of ['0123','1123','123','abcd','12345'])assert.equal(valid(v,4),false);});
test('스트라이크, 볼, 아웃 판정',()=>{assert.deepEqual(judge('4271','4217'),{strikes:2,balls:2});assert.deepEqual(judge('4271','7142'),{strikes:0,balls:4});assert.deepEqual(judge('4271','3568'),{strikes:0,balls:0});assert.deepEqual(judge('427156','427156'),{strikes:6,balls:0});});
