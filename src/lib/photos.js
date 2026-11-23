// Family photos live in Cloudflare R2 file storage (the PHOTOS binding), one folder per family, so the shared
// database stays small as more families join. A site without the PHOTOS binding (like a fresh copy of the
// template) keeps photos in the database as before.
//
// Photos added before R2 was set up are still in the database. The 15-minute job copies a few at a time into
// R2 and checks each copy (Cloudflare refuses the upload if a single byte differs, then we check its size).
// The original stays in the database until a person clears it, and the board falls back to it if the R2 copy
// is ever missing.

const MOVE_PER_RUN = 3; // a few each run keeps the job well inside the free plan's time limit

export const hasStore = (env) => !!env.PHOTOS;

export function fromB64(s) {
  if (globalThis.Buffer) return new Uint8Array(globalThis.Buffer.from(s, 'base64'));
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
export function toB64(bytes) {
  if (globalThis.Buffer) return globalThis.Buffer.from(bytes).toString('base64');
  let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s);
}
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const newKey = (hid) => `families/${hid}/${crypto.randomUUID()}`;

// Puts the bytes in R2 under a new key in this family's folder and checks the copy. Returns the key.
async function putChecked(env, hid, bytes, mime) {
  const key = newKey(hid);
  await env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: mime }, sha256: hex(await crypto.subtle.digest('SHA-256', bytes)) });
  const head = await env.PHOTOS.head(key);
  if (!head || head.size !== bytes.length) { await env.PHOTOS.delete(key).catch(() => {}); throw new Error('photo copy did not check out'); }
  return key;
}

// A new photo from the grown-ups' page. `data` is base64 without the data: prefix.
export async function addPhoto(env, { data, mime, w, h, by, now }) {
  if (!hasStore(env)) return (await env.DB.prepare('INSERT INTO photos(data,mime,w,h,added_by,created_at,household_id) VALUES(?,?,?,?,?,?,?)').bind(data, mime, w, h, by, now, env.HID).run()).meta.last_row_id;
  const bytes = fromB64(data); const key = await putChecked(env, env.HID, bytes, mime);
  try { return (await env.DB.prepare("INSERT INTO photos(data,mime,w,h,added_by,created_at,household_id,r2_key,size) VALUES('',?,?,?,?,?,?,?,?)").bind(mime, w, h, by, now, env.HID, key, bytes.length).run()).meta.last_row_id; }
  catch (e) { await env.PHOTOS.delete(key).catch(() => {}); throw e; }
}

// The picture itself, from R2 when it's there, otherwise from the database. Null when this family has no such photo.
export async function photoResponse(env, id) {
  const ph = await env.DB.prepare('SELECT data, mime, r2_key FROM photos WHERE id=? AND household_id=?').bind(id, env.HID).first(); if (!ph) return null;
  const headers = { 'content-type': ph.mime, 'cache-control': 'private, max-age=31536000, immutable' };
  if (ph.r2_key && hasStore(env)) { const obj = await env.PHOTOS.get(ph.r2_key).catch(() => null); if (obj) return new Response(obj.body, { headers: { ...headers, 'content-type': obj.httpMetadata?.contentType || ph.mime } }); }
  if (!ph.data) return null;
  return new Response(fromB64(ph.data), { headers });
}

export async function deletePhoto(env, id) {
  const ph = await env.DB.prepare('SELECT r2_key FROM photos WHERE id=? AND household_id=?').bind(id, env.HID).first();
  await env.DB.prepare('DELETE FROM photos WHERE id=? AND household_id=?').bind(id, env.HID).run();
  if (ph?.r2_key && hasStore(env)) await env.PHOTOS.delete(ph.r2_key).catch(() => {});
}

// When a family deletes its board: remove its files from R2 too (before the rows go, so we still know the keys).
export async function deleteFamilyPhotos(env) {
  if (!hasStore(env)) return;
  const keys = (await env.DB.prepare('SELECT r2_key FROM photos WHERE household_id=? AND r2_key IS NOT NULL').bind(env.HID).all()).results.map((r) => r.r2_key);
  for (let i = 0; i < keys.length; i += 500) await env.PHOTOS.delete(keys.slice(i, i + 500));
}

// For a family's data download: every photo with its picture as base64, wherever it's kept.
export async function exportRows(env, rows) {
  const out = [];
  for (const { household_id, r2_key, ...r } of rows) {
    if (!r.data && r2_key && hasStore(env)) { const obj = await env.PHOTOS.get(r2_key).catch(() => null); if (obj) r.data = toB64(new Uint8Array(await obj.arrayBuffer())); }
    out.push(r);
  }
  return out;
}

// Called by the 15-minute job: copies a few photos that are still only in the database into R2, each into its
// own family's folder. The database keeps the original. Returns how many were copied.
export async function moveSome(env, limit = MOVE_PER_RUN) {
  if (!hasStore(env)) return 0;
  const rows = (await env.DB.prepare("SELECT id, household_id, data, mime FROM photos /* all-families: each photo is copied into its own family's folder */ WHERE r2_key IS NULL AND data != '' ORDER BY id LIMIT ?").bind(limit).all()).results;
  let n = 0;
  for (const r of rows) {
    try {
      const bytes = fromB64(r.data); const key = await putChecked(env, r.household_id, bytes, r.mime);
      const up = await env.DB.prepare('UPDATE photos SET r2_key=?, size=? WHERE id=? AND household_id=? AND r2_key IS NULL').bind(key, bytes.length, r.id, r.household_id).run();
      if (up.meta?.changes) n++; else await env.PHOTOS.delete(key).catch(() => {}); // deleted or copied meanwhile
    } catch {}
  }
  return n;
}
