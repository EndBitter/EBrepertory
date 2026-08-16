/**
 * BitterMusicPlayer — 本地一键启动版
 * 在你自己国内可常开的电脑/服务器上运行本服务，
 * 手机 App 填这个地址即可搜索+播放热门歌（网易云/腾讯/酷狗等多平台）。
 *
 * 用法：
 *   node index.js            （监听 0.0.0.0:8300，局域网可访问）
 * 环境变量：
 *   PORT=?  自定义端口，默认 8300
 */
import http from 'node:http';
import { URL } from 'node:url';
import Meting from '@meting/core';

const PORT = process.env.PORT || 8300;
const SERVERS = ['netease', 'tencent', 'kugou', 'baidu', 'kuwo'];

function meting(server) {
  const s = SERVERS.includes(server) ? server : 'netease';
  const m = new Meting(s);
  m.format(true);
  return m;
}

function send(res, code, data) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': '*'
  });
  res.end(JSON.stringify(data));
}

function normalizeSongs(list, platform) {
  return (list || []).map(s => ({
    id: String(s.id || s.url_id || ''),
    name: s.name || '未知歌曲',
    artist: (s.artist || []).join(' / '),
    album: s.album || '',
    duration: Math.round(s.duration || 0),
    source: platform || s.source || 'netease',
    remote: true,
    src: ''
  }));
}

async function handleSearch(q, server) {
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
        return { songs: normalizeSongs(list, s), platform: s };
      }
      lastErr = new Error('empty result from ' + s);
    } catch (e) {
      lastErr = e;
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
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS', 'Access-Control-Allow-Headers': '*' });
    return res.end();
  }
  try {
    // 兼容带或不带 /api 前缀的路径
    const p = u.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
    if (p === '/' || p === '/health') return send(res, 200, { status: 'ok', service: 'bittermusic-meting', servers: SERVERS });
    if (p === '/search') return send(res, 200, await handleSearch(q, serverName));
    if (p === '/song/url') return send(res, 200, await handleUrl(q, serverName));
    if (p === '/lyric') return send(res, 200, await handleLyric(q, serverName));
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: e.message || 'server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('=====================================================');
  console.log(' BitterMusicPlayer 音乐后端已启动');
  console.log(' 本机访问:   http://127.0.0.1:' + PORT);
  console.log(' 局域网访问: http://你电脑的局域网IP:' + PORT);
  console.log(' 手机App里把API地址填成上面的 http://IP:PORT');
  console.log('=====================================================');
  console.log('');
});