// ============================================================
//  ASIABOX FINAL — Template LO + Scraper DramaDrip embutido
//  Cadeia completa: DramaDrip → ModPro → SID Bypass → DriveSeed → MP4 DIRETO
// ============================================================

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const cheerio = require('cheerio');
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const { URLSearchParams, URL } = require('url');

// --- Requisitos do Scraper DramaDrip ---
const axios = require('axios');
const FormData = require('form-data');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');

// ============================================================
//  1. HOSTS — DramaDrip = PRIORIDADE MÁXIMA (PT-BR em tudo)
// ============================================================
const HOSTS = [
  {
    name: 'DramaDrip 🇧🇷',
    domain: 'https://dramadrip.com',
    ptLevel: 4, // 4=dub+leg real | 3=dub | 2=leg | 1=orig
    isDramadrip: true,
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
      catalogItem: 'article.post',
      title: 'h2.entry-title a',
      poster: 'img',
      link: 'h2.entry-title a',
      synopsis: '.entry-content p',
      episodeLink: 'a[href*="episode"], a[href*="ep-"], .wp-block-button a'
    }
  },
  {
    name: 'DoramasGo 🇧🇷',
    domain: 'https://www.doramasgo.com',
    ptLevel: 3,
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
      catalogItem: 'article, .post, .item',
      title: 'h2 a, h3 a, .title a',
      poster: 'img', link: 'a',
      synopsis: '.sinopse, .summary, .resumo',
      episodeLink: 'a[href*="episodio"], .episode a'
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
      catalogItem: '.items article, .card',
      title: 'h2 a, .title a',
      poster: 'img', link: 'a',
      synopsis: '.sinopse, .resumo',
      episodeLink: 'a[href*="/episodio"], .episodes a'
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
      catalogItem: 'ul.listing li',
      title: 'a, .title',
      poster: 'img', link: 'a',
      synopsis: '.summary',
      episodeLink: 'ul.episodes li a'
    }
  }
];

// ============================================================
//  2. CACHE (idêntico ao template do LO)
// ============================================================
const CACHE = new Map();
const CACHE_TTL = {
  catalog: 30 * 60 * 1000,
  meta:    15 * 60 * 1000,
  stream:   5 * 60 * 1000
};
function cacheGet(key) {
  const e = CACHE.get(key); if (!e) return null;
  if (Date.now() > e.expires) { CACHE.delete(key); return null; }
  return e.data;
}
function cacheSet(key, data, ttl) { CACHE.set(key, { data, expires: Date.now() + ttl }); }

// ============================================================
//  3. UTILITÁRIOS (template LO intactos)
// ============================================================
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
];
function randomUA() { return USER_AGENTS[Math.floor(Math.random()*USER_AGENTS.length)]; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function encodeId(url) {
  return Buffer.from(url).toString('base64')
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function decodeId(id) {
  try {
    let b = id.replace(/-/g,'+').replace(/_/g,'/');
    while (b.length % 4) b += '=';
    return Buffer.from(b,'base64').toString('utf8');
  } catch { return null; }
}
function resolveUrl(href, base) {
  try { return new URL(href, base).href; } catch { return null; }
}
function detectLang(t='') {
  t = (t||'').toLowerCase();
  if (/\b(dublado|dublagem|voz\s*br|audio\s*br)\b/.test(t)) return 'DUB';
  if (/\b(legendado|legenda|pt-?br|hardsub|sub\s*br)\b/.test(t) || /\[leg\]|\(leg\)/i.test(t)) return 'LEG';
  return 'ORIG';
}

const MAX_BODY = 3 * 1024 * 1024;

// ============================================================
//  4. FETCH NATIVO (idêntico ao template LO — hosts fallback)
// ============================================================
function fetchHtml(url, maxRedirects = 5) {
  return new Promise((resolve, reject
