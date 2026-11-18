import test from 'node:test';
import assert from 'node:assert';
import { encryptPayload, decryptPayload, makeVapid, vapidAuth, b64u, unb64u } from '../src/lib/push.js';

test('payload round-trips through aes128gcm', async () => {
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: b64u(await crypto.subtle.exportKey('raw', ua.publicKey)), auth: b64u(auth) } };
  const msg = JSON.stringify({ title: 'Sam claimed a quest', body: 'Help cook dinner, 3 stars' });
  const body = await encryptPayload(sub, msg);
  assert.equal(body[20], 65); assert.equal(body.length, 16 + 4 + 1 + 65 + msg.length + 1 + 16);
  assert.equal(await decryptPayload(body, ua, auth), msg);
});

test('RFC 8291 section 5 vector: encrypt matches byte for byte, and decrypts', async () => {
  const jwk = (pubB64, d) => { const p = unb64u(pubB64); return { kty: 'EC', crv: 'P-256', d, x: b64u(p.slice(1, 33)), y: b64u(p.slice(33, 65)) }; };
  const imp = async (pubB64, d) => ({ privateKey: await crypto.subtle.importKey('jwk', jwk(pubB64, d), { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), publicKey: await crypto.subtle.importKey('raw', unb64u(pubB64), { name: 'ECDH', namedCurve: 'P-256' }, true, []) });
  const UA_PUB = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4';
  const AS_PUB = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
  const ua = await imp(UA_PUB, 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94'); const as = await imp(AS_PUB, 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw');
  const expected = 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN';
  const sub = { endpoint: 'https://push.example/x', keys: { p256dh: UA_PUB, auth: 'BTBZMqHH6r4Tts7J_aSIgg' } };
  const body = await encryptPayload(sub, 'When I grow up, I want to be a watermelon', { salt: unb64u('DGv6ra1nlYgDCS1FRnbzlw'), asKeyPair: as });
  assert.equal(b64u(body), expected);
  assert.equal(await decryptPayload(unb64u(expected), ua, unb64u('BTBZMqHH6r4Tts7J_aSIgg')), 'When I grow up, I want to be a watermelon');
});

test('VAPID header is a valid ES256 JWT', async () => {
  const v = await makeVapid(); const h = await vapidAuth('https://fcm.googleapis.com/fcm/send/xyz', v, 'mailto:a@b.c');
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h); assert.ok(m);
  const claims = JSON.parse(new TextDecoder().decode(unb64u(m[2]))); assert.equal(claims.aud, 'https://fcm.googleapis.com');
  const pub = await crypto.subtle.importKey('raw', unb64u(m[4]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64u(m[3]), new TextEncoder().encode(m[1] + '.' + m[2])));
});
