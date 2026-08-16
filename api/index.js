/**
 * BitterMusicPlayer — Vercel Serverless 版音乐源代理
 * 与本地版 index.js 契约一致：
 *   GET /api/search?keywords=xxx&server=netease  -> { songs: [...] }
 *   GET /api/song/url?id=xxx&server=netease      -> { url: "..." }
 *   GET /api/lyric?id=xxx&server=netease         -> { lrc: { lyric } }
 */
import Meting from '@meting/core';

const SERVERS = ['netease', 'tencent', 'kugou', 'baidu', 'kuwo'];

function meting(server) {
  const s = SERVERS.includes(server) ? server : 'netease';
  const m = new Meting(s);
  m.format(true);
  return m;
}

function normalizeSongs(list) {
  return (list || []).map(s => ({
    id: String(s.id || s.url_id || ''),
    name: s.name || '未知歌曲',
    artist: (s.artist || []).join(' / '),
    album: s.album || '',
    duration: Math.round(s.duration || 0),
    source: s.source || 'netease',
    remote: true,
    src: ''
  }));
}

async function handleSearch(q, server) {
  // 优先请求指定平台，若被限流(429)或失败，自动按序降级到其他平台
  const preferred = SERVERS.includes(server) ? [server] : [];
  const fallbacks = SERVERS.filter(s => s !== server);
  const order = [...preferred, ...fallbacks];
  let lastErr = null;
  for (const s of order) {
    try {
      const m = meting(s);
      const raw = await m.search(q.keywords || '', { page: 1, limit: 20 });
      const list = JSON.parse(raw);
      if (list && list.length) {
        return { songs: normalizeSongs(list), platform: s };
      }
      lastErr = new Error('empty result from ' + s);
    } catch (e) {
      lastErr = e;
      // 限流则稍作停顿再试下一个平台
      await new Promise(r => setTimeout(r, 600));
    }
  }
  throw lastErr || new Error('no source available');
}

async function handleUrl(q, server) {
  const m = meting(server);
  const id = q.id || '';
  for (const br of [320, 128]) {
    try {
      const raw = await m.url(id, br);
      const info = JSON.parse(raw);
      if (info && info.url) return { url: info.url, bitrate: br };
    } catch (e) { /* try next */ }
  }
  return { url: '' };
}

async function handleLyric(q, server) {
  const m = meting(server);
  const id = q.id || '';
  try {
    const raw = await m.lyric(id);
    const obj = JSON.parse(raw);
    const lyric = (obj && (obj.lyric || (obj.lrc && obj.lrc.lyric))) || '';
    return { lrc: { lyric } };
  } catch (e) {
    return { lrc: { lyric: '' } };
  }
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const q = Object.fromEntries(url.searchParams.entries());
  const serverName = q.server || 'netease';

  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': '*'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }

  try {
    let data;
    if (url.pathname === '/' || url.pathname.endsWith('/health') || url.pathname === '/api') {
      data = { status: 'ok', service: 'bittermusic-meting', servers: SERVERS };
    } else if (url.pathname.endsWith('/search')) {
      data = await handleSearch(q, serverName);
    } else if (url.pathname.endsWith('/song/url')) {
      data = await handleUrl(q, serverName);
    } else if (url.pathname.endsWith('/lyric')) {
      data = await handleLyric(q, serverName);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json', ...cors });
      return res.end(JSON.stringify({ error: 'not found' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...cors });
    return res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json', ...cors });
    return res.end(JSON.stringify({ error: e.message || 'server error' }));
  }
}