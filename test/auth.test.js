import test from 'node:test';
import assert from 'node:assert';
import { hashPassword, verifyPassword, passwordProblem, recoveryCode, sameString, ITER } from '../src/lib/auth.js';
test('password hashing verifies and rejects', async () => {
  const h = await hashPassword('we love the family dog'); assert.equal(h.iter, ITER); assert.equal(h.hash.length, 64);
  const user = { pw_hash: h.hash, pw_salt: h.salt, pw_iter: h.iter };
  assert.ok(await verifyPassword('we love the family dog', user)); assert.ok(!(await verifyPassword('we love the family cat', user))); assert.ok(!(await verifyPassword('x', {})));
  assert.notEqual((await hashPassword('same', 'a')).hash, (await hashPassword('same', 'b')).hash);
});
test('weak passwords are refused', () => { assert.ok(passwordProblem('short')); assert.ok(passwordProblem('aaaaaaaaaaaa')); assert.ok(passwordProblem('1234567890ab')); assert.equal(passwordProblem('pancakes on sunday'), null); });
test('recovery codes and constant-time compare', () => { const c = recoveryCode(); assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/); assert.ok(sameString('abc', 'abc')); assert.ok(!sameString('abc', 'abd')); assert.ok(!sameString('abc', 'ab')); });
