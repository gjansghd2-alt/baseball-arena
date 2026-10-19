import { randomInt } from 'node:crypto';
export function valid(value, digits) {
  return typeof value === 'string' && /^[1-9][0-9]+$/.test(value) && value.length === digits && new Set(value).size === digits;
}
export function answer(digits) {
  let value = String(randomInt(1,10));
  while (value.length < digits) { const n = String(randomInt(10)); if (!value.includes(n)) value += n; }
  return value;
}
export function judge(secret, guess) {
  let strikes=0, balls=0;
  [...guess].forEach((n,i)=>{if(secret[i]===n)strikes++;else if(secret.includes(n))balls++;});
  return {strikes,balls};
}
