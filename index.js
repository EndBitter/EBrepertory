/**
 * BitterMusicPlayer — Meting 音乐源代理服务
 *
 * 基于 metowolf/Meting (@meting/core) 封装为标准 HTTP 接口，
 * 供播放器 / APK 调用。统一契约：
 *   GET /search?keywords=xxx&server=netease   -> { songs: [...] }
 *   GET /song/url?id=xxx&server=netease       -> { url: "..." }
 *   GET /lyric?id=xxx&server=netease          -> { lrc: { lyric: "..." } }
 *
 * 启动：node index.js   （默认端口 8300）
 */
import http from 'node:http';
import { URL } from 'node:url';
import Meting from '@meting/core';

const PORT = process.env.PORT || 8300;
const SERVERS = ['netease', 'tencent', 'kugou', 'baidu', 'kuwo'];

/** 创建指定平台的 Meting 实例 */
function meting(server) {
  const s = SERVERS.includes(server) ? server : 'netease';
  const m = new Meting(s);
  m.format(true);
  return m;
}

/** 统一 JSON 响应 */
function send(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': '*'
  });
  res.end(JSON.stringify(data));
}

/** 将 Meting 搜索结果标准化为播放器需要的格式 */
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
  const m = meting(server);
  const raw = await m.search(q.keywords || '', { page: 1, limit: 20 });
  const list = JSON.parse(raw);
  return { songs: normalizeSongs(list) };
}

async function handleUrl(q, server) {
  const m = meting(server);
  const id = q.id || '';
  // 依次尝试 320 / 128 kbps，取第一个可用的
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
    const lyric = (obj && (obj.lyric || obj.lrc && obj.lrc.lyric)) || '';
    return { lrc: { lyric } };
  } catch (e) {
    return { lrc: { lyric: '' } };
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const q = Object.fromEntries(u.searchParams.entries());
  const serverName = q.server || 'netease';

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Access-Control-Allow-Headers': '*'
    });
    return res.end();
  }

  try {
    if (u.pathname === '/' || u.pathname === '/health') {
      return send(res, 200, { status: 'ok', service: 'bittermusic-meting', servers: SERVERS });
    }
    if (u.pathname === '/search') {
      return send(res, 200, await handleSearch(q, serverName));
    }
    if (u.pathname === '/song/url') {
      return send(res, 200, await handleUrl(q, serverName));
    }
    if (u.pathname === '/lyric') {
      return send(res, 200, await handleLyric(q, serverName));
    }
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: e.message || 'server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[BitterMusic] Meting 代理服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`[BitterMusic] 支持平台: ${SERVERS.join(', ')}`);
});