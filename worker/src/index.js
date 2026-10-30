import core from '../../app/js/core.js';
import player from '../../app/js/player.js';
import beacon from './beacon.js';
import rank from './rank.js';
import db from './db.js';

const QRNG = 'https://lizaonair.com/qrng/';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, CORS),
  });
}

async function handlePick(req, env, now) {
  let b;
  try { b = await req.json(); } catch (e) { return json({ error: 'bad_input' }, 400); }
  const ok = b && typeof b.playerId === 'string' && b.playerId.length >= 8 && b.playerId.length <= 64 &&
    player.validNickname(b.nickname) && typeof b.hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(b.hex) &&
    Number.isInteger(b.roundId);
  if (!ok) return json({ error: 'bad_input' }, 400);
  const openRoundId = core.openRoundFor(now);
  if (b.roundId !== openRoundId) return json({ error: 'round_closed', openRoundId }, 409);
  const saved = await db.savePick(env.DB, {
    playerId: b.playerId, nickname: b.nickname.toUpperCase(), roundId: b.roundId, hex: b.hex.toUpperCase(),
    submittedAt: now, dayKey: core.dayKey(b.roundId), weekKey: core.weekKey(b.roundId),
  });
  return saved ? json({ ok: true, roundId: b.roundId }) : json({ error: 'already_picked' }, 409);
}

async function handleRound(env, roundId, playerId, now) {
  const row = await db.getRound(env.DB, roundId);
  let status = row ? row.status : (roundId > now ? 'open' : 'void');
  if (status === 'open' && roundId <= now) status = 'waiting';
  const out = { roundId, status, players: row ? await db.countPicks(env.DB, roundId) : 0, top: [] };
  if (status === 'resolved') {
    out.hex = row.hex;
    out.pulseIndex = row.pulse_index;
    out.top = (await db.topPicks(env.DB, roundId, 10)).map(p => ({
      nickname: p.nickname, tag: p.player_id.slice(0, 4), hex: p.hex, closeness: p.closeness, rank: p.rank,
    }));
  }
  if (playerId) {
    const me = await db.playerPick(env.DB, roundId, playerId);
    if (me) out.me = me;
  }
  return json(out);
}

const PERIODS = {
  day: now => ['day_key', core.dayKey(now)],
  week: now => ['week_key', core.weekKey(now)],
  all: () => [null, 'all'],
};

async function handleBoard(env, period, playerId, now) {
  const [column, key] = PERIODS[period](now);
  const rows = await db.board(env.DB, column, key, playerId, 10);
  const shape = r => ({ nickname: r.nickname, tag: r.player_id.slice(0, 4), hex: r.hex, closeness: r.closeness, roundId: r.round_id, rank: r.rank });
  const out = { period, key, top: rows.filter(r => r.rank <= 10).map(shape) };
  const me = rows.find(r => r.player_id === playerId);
  if (me) out.me = shape(me);
  return json(out);
}

async function qrngInt(max) {
  const res = await fetch(`${QRNG}?min=0&max=${max}`, { headers: { Accept: 'application/json' } });
  const v = res.ok ? (await res.json()).value : null;
  if (!Number.isInteger(v) || v < 0 || v > max) throw new Error('qrng bad value');
  return v;
}

async function handlePractice() {
  try {
    const [rg, b] = await Promise.all([qrngInt(65535), qrngInt(255)]);
    return json({ rgb: [rg >> 8, rg & 255, b] });
  } catch (e) {
    return json({ error: 'qrng_unavailable' }, 502);
  }
}

export async function resolveDue(env, now) {
  const ids = await db.dueRounds(env.DB, now);
  for (const id of ids) {
    try {
      const pulse = await beacon.fetchPulseFrom(id, fetch);
      const choice = beacon.choosePulse(id, pulse, Date.now());
      if (choice.status === 'void') await db.voidRound(env.DB, id, Date.now());
      if (choice.status !== 'ok') continue;
      const rgb = core.rgbFromOutputValue(choice.pulse.outputValue);
      const ranked = rank.rankPicks(await db.roundPicks(env.DB, id), rgb);
      await db.resolveRound(env.DB, id, choice.pulse.pulseIndex, core.toHex(rgb), ranked, Date.now());
    } catch (e) {
      console.error('resolve failed for round', id, e);
    }
  }
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    const parts = url.pathname.split('/').filter(Boolean);
    const playerId = url.searchParams.get('player');
    const now = Date.now();
    try {
      if (req.method === 'GET' && url.pathname === '/now') return json({ now, openRoundId: core.openRoundFor(now) });
      if (req.method === 'POST' && url.pathname === '/pick') return await handlePick(req, env, now);
      if (req.method === 'GET' && parts[0] === 'round' && /^\d+$/.test(parts[1] || '')) return await handleRound(env, Number(parts[1]), playerId, now);
      if (req.method === 'GET' && parts[0] === 'board' && PERIODS.hasOwnProperty(parts[1])) return await handleBoard(env, parts[1], playerId, now);
      if (req.method === 'GET' && url.pathname === '/practice') return await handlePractice();
      return json({ error: 'not_found' }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: 'server_error' }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(resolveDue(env, Date.now()));
  },
};
