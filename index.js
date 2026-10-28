const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const cheerio = require('cheerio');
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const { URL } = require('url');

// ====================== CONFIGURAÇÃO DOS HOSTS ======================
// Cada host tem SEUS seletores e caminhos — NÃO dá mais "link fetch error"
// Ordem = prioridade PT-BR. Se um cair, o próximo é usado automaticamente.
const HOSTS = [
  {
    name: 'DoramasGo 🇧🇷',
    domain: 'https://www.doramasgo.com',
    ptLevel: 3, // 3=dub | 2=leg | 1=original
    catalogs: [
      { id: 'kdrama-series', name: '🇰🇷 K-Drama • Séries', type: 'series', path: '/k-drama' },
      { id: 'kdrama-movies', name: '🇰🇷 K-Drama • Filmes', type: 'movie',  path: '/k-drama-filmes' },
      { id: 'cdrama-series', name: '🇨🇳 C-Drama • Séries', type: 'series', path: '/c-drama' },
      { id: 'cdrama-movies', name: '🇨🇳 C-Drama • Filmes', type: 'movie',  path: '/c-drama-filmes' },
      { id: 'jdrama-series', name: '🇯🇵 J-Drama • Séries', type: 'series', path: '/j-drama' },
      { id: 'jdrama-movies', name: '🇯🇵 J-Drama • Filmes', type: 'movie',  path: '/j-drama-filmes' }
    ],
    searchPath: '/?s=',
    selectors: {
      catalogItem: 'article, .post, .item, .movie-item',
      title: 'h2 a, h3 a, .title a, .entry-title a',
      poster: 'img',
      link: 'a',
      synopsis: '.sinopse, .summary, .resumo, .description',
      episodeLink: 'a[href*="episodio"], a[href*="/ep-"], .episode a, .ep-item a'
    }
  },
  {
    name: 'DoramasMP4 🇧🇷',
    domain: 'https://www.doramasmp4.com',
    ptLevel: 3,
    catalogs: [
      { id: 'kdrama-series', name: '🇰🇷 K-Drama • Séries', type: 'series', path: '/kdrama' },
      { id: 'kdrama-movies', name: '🇰🇷 K-Drama • Filmes', type: 'movie',  path: '/filmes-coreanos' },
      { id: 'cdrama-series', name: '🇨🇳 C-Drama • Séries', type: 'series', path: '/cdrama' },
      { id: 'cdrama-movies', name: '🇨🇳 C-Drama • Filmes', type: 'movie',  path: '/filmes-chineses' },
      { id: 'jdrama-series', name: '🇯🇵 J-Drama • Séries', type: 'series', path: '/jdrama' },
      { id: 'jdrama-movies', name: '🇯🇵 J-Drama • Filmes', type: 'movie',  path: '/filmes-japoneses' }
    ],
    searchPath: '/?s=',
    selectors: {
      catalogItem: '.items article, .card, .movie-item',
      title: 'h2 a, .title a, .name a',
      poster: 'img',
      link: 'a',
      synopsis: '.sinopse, .summary, .resumo',
      episodeLink: 'a[href*="/episodio"], a[href*="-ep-"], .episodes a'
    }
  },
  {
    name: 'KissAsian',
    domain: 'https://kissasian.si',
    ptLevel: 1,
    catalogs: [
      { id: 'kdrama-series', name: '🇰🇷 K-Drama • Séries', type: 'series', path: '/korean-drama' },
      { id: 'kdrama-movies', name: '🇰🇷 K-Drama • Filmes', type: 'movie',  path: '/korean-movie' },
      { id: 'cdrama-series', name: '🇨🇳 C-Drama • Séries', type: 'series', path: '/chinese-drama' },
      { id: 'cdrama-movies', name: '🇨🇳 C-Drama • Filmes', type: 'movie',  path: '/chinese-movie' },
      { id: 'jdrama-series', name: '🇯🇵 J-Drama • Séries', type: 'series', path: '/japanese-drama' },
      { id: 'jdrama-movies', name: '🇯🇵 J-Drama • Filmes', type: 'movie',  path: '/japanese-movie' }
    ],
    searchPath: '/search/?keyword=',
    selectors: {
      catalogItem: 'ul.listing li, .item',
      title: 'a, .title',
      poster: 'img',
      link: 'a',
      synopsis: '.summary, .description',
      episodeLink: 'ul.episodes li a, a[href*="/episode"]'
    }
  },
  {
    name: 'DramaNice',
    domain: 'https://dramanice.video',
    ptLevel: 1,
    catalogs: [
      { id: 'kdrama-series', name: '🇰🇷 K-Drama • Séries', type: 'series', path: '/korean-drama' },
      { id: 'kdrama-movies', name: '🇰🇷 K-Drama • Filmes', type: 'movie',  path: '/korean-movie' },
      { id: 'cdrama-series', name: '🇨🇳 C-Drama • Séries', type: 'series', path: '/chinese-drama' },
      { id: 'cdrama-movies', name: '🇨🇳 C-Drama • Filmes', type: 'movie',  path: '/chinese-movie' },
      { id: 'jdrama-series', name: '🇯🇵 J-Drama • Séries', type: 'series', path: '/japanese-drama' },
      { id: 'jdrama-movies', name: '🇯🇵 J-Drama • Filmes', type: 'movie',  path: '/japanese-movie' }
    ],
    searchPath: '/search?keyword=',
    selectors: {
      catalogItem: '.list-episode-item, .item, .card',
      title: 'h3 a, .title a',
      poster: 'img',
      link: 'a',
      synopsis: '.summary, .description',
      episodeLink: '.episodes a, a[href*="/episode"]'
    }
  }
];

// ====================== CACHE EM MEMÓRIA (idêntico ao seu template) ======================
const CACHE = new Map();
const CACHE_TTL = {
  catalog: 30 * 60 * 1000,   // 30 min
  meta:    15 * 60 * 1000,   // 15 min
  stream:   5 * 60 * 1000    // 5 min
};

function cacheGet(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { CACHE.delete(key); return null; }
  return entry.data;
}
function cacheSet(key, data, ttl) {
  CACHE.set(key, { data, expires: Date.now() + ttl });
}

// ====================== UTILITÁRIOS (seus + melhorias) ======================
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
];
function randomUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function encodeId(url) {
  return Buffer.from(url).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function decodeId(id) {
  try {
    let b64 = id.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch { return null; }
}

function resolveUrl(href, base) {
  try { return new URL(href, base).href; } catch { return null; }
}

function detectLang(text = '') {
  const t = (text || '').toLowerCase();
  if (/\b(dublado|dublagem|voz\s*br|audio\s*br|portugu[êe]s\s*dublado)\b/.test(t)) return 'DUB';
  if (/\b(legendado|legenda|pt-?br|hardsub|sub\s*br|portugu[êe]s)\b/.test(t) || /\[leg\]|\(leg\)/i.test(t)) return 'LEG';
  return 'ORIG';
}

const MAX_BODY = 3 * 1024 * 1024;

// ====================== FETCH NATIVO (idêntico ao seu template) ======================
function fetchHtml(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const doRequest = (currentUrl, redirectsLeft) => {
      const client = currentUrl.startsWith('https') ? https : http;
      const agent = new client.Agent({ keepAlive: true, maxSockets: 20 });
      const req = client.get(currentUrl, {
        agent,
        headers: {
          'User-Agent': randomUA(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
          'Connection': 'keep-alive'
        },
        timeout: 15000
      }, (res) => {
        if ([301,302,303,307,308].includes(res.statusCode) && res.headers.location) {
          if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
          const next = resolveUrl(res.headers.location, currentUrl);
          if (!next) return reject(new Error('Invalid redirect'));
          res.resume();
          return doRequest(next, redirectsLeft - 1);
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const enc = (res.headers['content-encoding'] || '').toLowerCase();
        let stream = res;
        if (enc === 'gzip')    stream = res.pipe(zlib.createGunzip());
        else if (enc === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (enc === 'br')      stream = res.pipe(zlib.createBrotliDecompress());

        const chunks = []; let size = 0;
        stream.on('data', chunk => {
          size += chunk.length;
          if (size > MAX_BODY) { stream.destroy(); return reject(new Error('Response too large')); }
          chunks.push(chunk);
        });
        stream.on('end',   () => resolve(Buffer.concat(chunks).toString('utf8')));
        stream.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    };
    doRequest(url, maxRedirects);
  });
}

function parseSeasonEpisode(text, index = 0) {
  text = (text || '').toLowerCase().replace(/\s+/g, ' ');
  let m = text.match(/s(?:eason)?\s*(\d+)\s*e(?:pisode)?\s*(\d+)/i);
  if (m) return { season: +m[1], episode: +m[2] };
  m = text.match(/temporada\s*(\d+).*?(?:ep|epis[oó]dio)\s*(\d+)/i);
  if (m) return { season: +m[1], episode: +m[2] };
  m = text.match(/(\d+)\s*x\s*(\d+)/);
  if (m) return { season: +m[1], episode: +m[2] };
  m = text.match(/(?:ep|epis[oó]dio)\s*(\d+)/i);
  if (m) return { season: 1, episode: +m[1] };
  m = text.match(/\b(\d+)\b/);
  if (m && +m[1] < 1000) return { season: 1, episode: +m[1] };
  return { season: 1, episode: index + 1 };
}

const AD_DOMAINS = [
  'doubleclick.net','googlesyndication.com','adservice.google',
  'popads','popcash','propellerads','exoclick','juicyads',
  'adsterra','trafficjunky','mgid.com','taboola','outbrain',
  'adnxs.com','advertising.com','openx.net','rubiconproject.com',
  'pubmatic.com','indexww.com','criteo.com','onetag.com',
  'adtng.com','ad-maven.com','adskeeper.co.uk','adoperators.com'
];
function
