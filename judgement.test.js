import test from 'node:test';
import assert from 'node:assert/strict';
import {judge,valid,answer} from './logic.js';
// Independent reference: exact index matches + set intersection count.
function reference(secret,guess){const exact=[...secret].map((n,i)=>n===guess[i]?1:0).reduce((a,b)=>a+b,0);const common=new Set([...secret].filter(n=>new Set(guess).has(n))).size;return {strikes:exact,balls:common-exact};}
function* guesses(n,prefix=''){if(prefix.length===n){yield prefix;return;}for(const d of '0123456789'){if(prefix.includes(d)||(!prefix&&d==='0'))continue;yield* guesses(n,prefix+d);}}
for(const [digits,secrets,total]of [[4,['1234','9072','8640'],4536],[5,['12345','90721','86403'],27216],[6,['123456','907218','864035'],136080]])test(`${digits}자리 모든 유효 추측 × 서로 다른 정답 3개 (${total*3}건)`,()=>{let count=0;for(const guess of guesses(digits)){assert.ok(valid(guess,digits));for(const secret of secrets){const actual=judge(secret,guess);assert.deepEqual(actual,reference(secret,guess),`${secret} / ${guess}`);assert.ok(actual.strikes>=0&&actual.balls>=0&&actual.strikes+actual.balls<=digits);if(actual.strikes===digits)assert.equal(secret,guess);}count++;}assert.equal(count,total);});
test('명시적인 스트라이크·볼·아웃·0 포함·홈런 예시',()=>{for(const [s,g,expected]of [['4271','4217',{strikes:2,balls:2}],['4271','7142',{strikes:0,balls:4}],['4271','3568',{strikes:0,balls:0}],['1023','1230',{strikes:1,balls:3}],['12345','51234',{strikes:0,balls:5}],['123456','654321',{strikes:0,balls:6}],['907218','907218',{strikes:6,balls:0}]])assert.deepEqual(judge(s,g),expected);});
test('정답 생성 30,000회: 길이·중복·첫 자리 0 검사',()=>{for(const digits of [4,5,6])for(let i=0;i<10000;i++)assert.ok(valid(answer(digits),digits));});
