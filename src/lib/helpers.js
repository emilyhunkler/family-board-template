// Weather (Open-Meteo), grocery aisles, event matching, voice rules.
import { parts } from './ical.js';

const WX = { 0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Cloudy'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Fog'], 51: ['🌦️', 'Drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌧️', 'Drizzle'],
  61: ['🌧️', 'Rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'], 66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'], 71: ['🌨️', 'Snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['🌨️', 'Snow grains'],
  80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Heavy showers'], 85: ['🌨️', 'Snow showers'], 86: ['🌨️', 'Snow showers'], 95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm'], 99: ['⛈️', 'Thunderstorm'] };
export const wxIcon = (code, isDay = 1) => { const w = WX[code] || ['🌡️', '']; return (code <= 1 && !isDay) ? ['🌙', 'Clear night'] : w; };
export async function fetchWeather(cfg) {
  const w = cfg.weather; if (w.lat == null || w.lon == null) return null; const u = new URL('https://api.open-meteo.com/v1/forecast');
  Object.entries({ latitude: w.lat, longitude: w.lon, current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation,is_day,relative_humidity_2m',
    hourly: 'temperature_2m,weather_code,precipitation_probability', daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
    temperature_unit: w.units || 'fahrenheit', wind_speed_unit: 'mph', timezone: cfg.zone, forecast_days: 8 }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { 'User-Agent': 'family-board' } }); if (!r.ok) throw new Error('weather ' + r.status);
  const j = await r.json(); const c = j.current; const d = j.daily; const days = d.time.map((t, i) => ({ date: t, code: d.weather_code[i], icon: wxIcon(d.weather_code[i])[0], label: wxIcon(d.weather_code[i])[1], high: Math.round(d.temperature_2m_max[i]), low: Math.round(d.temperature_2m_min[i]), rainPct: d.precipitation_probability_max[i] ?? 0, sunrise: d.sunrise[i].slice(11, 16), sunset: d.sunset[i].slice(11, 16), uv: d.uv_index_max?.[i] }));
  const hourly = j.hourly.time.map((t, i) => ({ time: t, hour: t.slice(11, 16), date: t.slice(0, 10), temp: Math.round(j.hourly.temperature_2m[i]), code: j.hourly.weather_code[i], icon: wxIcon(j.hourly.weather_code[i], t.slice(11, 13) >= '07' && t.slice(11, 13) < '18' ? 1 : 0)[0], rainPct: j.hourly.precipitation_probability[i] ?? 0 }));
  const [icon, label] = wxIcon(c.weather_code, c.is_day);
  return { current: { temp: Math.round(c.temperature_2m), feels: Math.round(c.apparent_temperature), code: c.weather_code, icon, label, wind: Math.round(c.wind_speed_10m), humidity: c.relative_humidity_2m, isDay: c.is_day }, days, hourly, place: w.place, fetchedAt: new Date().toISOString() };
}
export function weatherTip(cfg, day, current) {
  if (!day) return ''; const snow = [71, 73, 75, 77, 85, 86].includes(day.code) || [71, 73, 75, 77, 85, 86].includes(current?.code);
  const ctx = { snow, rainPct: day.rainPct, high: day.high, low: day.low, feels: current?.feels ?? day.high };
  for (const t of cfg.tips || []) {
    const m = /^(\w+)(?:(>=|<=|>|<|==)(-?\d+))?$/.exec(t.when); if (!m) continue; const v = ctx[m[1]];
    if (m[2] === undefined) { if (v) return t.text; continue; } const n = Number(m[3]);
    if ((m[2] === '>=' && v >= n) || (m[2] === '<=' && v <= n) || (m[2] === '>' && v > n) || (m[2] === '<' && v < n) || (m[2] === '==' && v === n)) return t.text;
  }
  return 'Nice day';
}
const AISLES = [
  ['produce', /\b(banana|apple|orange|grape|berr|strawberr|blueberr|lemon|lime|avocado|tomato|onion|garlic|potato|carrot|celery|lettuce|spinach|kale|broccoli|cauliflower|pepper|cucumber|zucchini|squash|mushroom|herb|cilantro|parsley|basil|ginger|mango|pear|peach|plum|melon|pineapple|salad|fruit|veg)/i],
  ['bakery', /\b(bread|bagel|bun|roll|tortilla|pita|croissant|muffin|cake|donut|baguette)/i],
  ['dairy', /\b(milk|oat milk|almond milk|yogurt|yoghurt|cheese|butter|cream|egg|eggs|sour cream|cottage|kefir|half and half)/i],
  ['meat', /\b(chicken|beef|pork|turkey|ham|bacon|sausage|steak|ground|fish|salmon|shrimp|tuna|hot dog|deli)/i],
  ['frozen', /\b(frozen|ice cream|popsicle|pizza|waffle|peas)/i],
  ['pantry', /\b(pasta|rice|bean|lentil|flour|sugar|oil|olive oil|vinegar|salt|pepper|spice|cereal|oat|oatmeal|granola|cracker|chip|pretzel|snack|cookie|peanut butter|jam|jelly|honey|syrup|sauce|salsa|soup|broth|stock|can|canned|taco|tortilla chip|coffee|tea|juice|water|soda|seltzer|nut|almond|cashew|raisin|bar)/i],
  ['pets', /\b(dog|cat|treat|kibble|poop bag|litter|pet food)/i],
  ['household', /\b(soap|dish|detergent|paper towel|toilet paper|tissue|trash bag|sponge|cleaner|bleach|foil|wrap|ziploc|bag|battery|light bulb|laundry|dryer sheet)/i],
  ['personal', /\b(shampoo|conditioner|toothpaste|toothbrush|floss|deodorant|lotion|sunscreen|band-?aid|medicine|vitamin|tylenol|ibuprofen)/i],
];
export const AISLE_ORDER = ['produce', 'bakery', 'deli', 'meat', 'dairy', 'frozen', 'pantry', 'pets', 'household', 'personal', 'other'];
export function aisleFor(text) { for (const [a, re] of AISLES) if (re.test(text)) return a; return 'other'; }

// Who is an event about? Whole-word matches on each person's name and keywords; group phrases mean every kid.
// Falls back to the calendar's owner, else nobody (shown as Family).
const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text, w) => !!w && new RegExp(`(^|[^\\p{L}\\p{N}])${esc(w.toLowerCase())}(?=$|[^\\p{L}\\p{N}])`, 'u').test(text);
export function eventPeople(ev, cfg) {
  const t = (ev.title || '').toLowerCase(); const ids = [];
  for (const k of cfg.kids) if ([k.name, ...(k.match || [])].some((w) => hasWord(t, w))) ids.push(k.id);
  const groups = cfg.family.groupWords || ['the girls', 'the kids', 'both girls', 'both kids'];
  if (groups.some((w) => hasWord(t, w))) for (const k of cfg.kids) if (!ids.includes(k.id)) ids.push(k.id);
  for (const pa of cfg.family.parents) if ([pa.name, ...(pa.match || [])].some((w) => hasWord(t, w))) ids.push(pa.id);
  if (!ids.length && ev.owner) ids.push(ev.owner);
  return ids;
}
export function placeFor(ev, cfg) {
  const hay = ((ev.location || '') + ' ' + (ev.title || '')).toLowerCase();
  return (cfg.places || []).find((p) => p.match && hay.includes(p.match.toLowerCase())) || null;
}
export function eventEmoji(title) {
  const t = title.toLowerCase();
  const map = [[/swim/, '🏊'], [/piano/, '🎹'], [/violin|strings|orchestra/, '🎻'], [/soccer|futsal/, '⚽'], [/football/, '🏈'], [/basketball/, '🏀'], [/dentist/, '🦷'], [/doctor|dr\.|pediatric|appointment/, '🩺'], [/birthday|party/, '🎉'], [/school|pto|conference/, '🏫'], [/garage|car|subaru|oil/, '🚗'], [/flight|trip|travel/, '✈️'], [/dinner|lunch|brunch/, '🍽️'], [/church|mass/, '⛪'], [/dance|ballet/, '🩰'], [/gymnastics/, '🤸'], [/music|concert|recital/, '🎵'], [/library|book/, '📚'], [/dog|vet|puppy/, '🐶'], [/holiday|santa|christmas|thanksgiving/, '🎄'], [/install|repair|fix|plumb/, '🔧'], [/walk|hike|run/, '🥾']];
  for (const [re, e] of map) if (re.test(t)) return e; return '📅';
}
export function hhmm(d, zone) { const p = parts(new Date(d), zone); return `${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}`; }
