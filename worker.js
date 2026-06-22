/**
 * worker.js  –  MovieBox REST API on Cloudflare Workers
 *
 * A zero-RAM, globally distributed port of the original Express server.
 * All Node.js-specific APIs (crypto, Buffer, stream, process.env) have been
 * replaced with their Web-platform equivalents that run natively on the
 * Workers V8 isolate.
 *
 * ─── Deploy ────────────────────────────────────────────────────────────────
 *   npx wrangler deploy
 *
 * ─── Optional Wrangler secrets (fall back to built-in defaults) ────────────
 *   npx wrangler secret put MOVIEBOX_SECRET_KEY_DEFAULT
 *   npx wrangler secret put MOVIEBOX_SECRET_KEY_ALT
 *   npx wrangler secret put MOVIEBOX_AUTH_TOKEN
 *
 * ─── Optional Wrangler vars (wrangler.toml [vars]) ────────────────────────
 *   TAB_HOME, TAB_MOVIE, TAB_TV, TAB_ANIMATION, TAB_RANKING
 */

// =============================================================================
// MD5  (pure JS – Web Crypto API does not expose MD5)
// Based on the Paul Johnston / Angel Marin implementation (BSD-licensed).
// =============================================================================

function _md5safeAdd(x, y) {
  return (x + y) | 0;
}
function _md5rotl(x, n) {
  return (x << n) | (x >>> (32 - n));
}
function _md5cmn(q, a, b, x, s, t) {
  return _md5safeAdd(
    _md5rotl(_md5safeAdd(_md5safeAdd(a, q), _md5safeAdd(x, t)), s),
    b,
  );
}
function _md5ff(a, b, c, d, x, s, t) {
  return _md5cmn((b & c) | (~b & d), a, b, x, s, t);
}
function _md5gg(a, b, c, d, x, s, t) {
  return _md5cmn((b & d) | (c & ~d), a, b, x, s, t);
}
function _md5hh(a, b, c, d, x, s, t) {
  return _md5cmn(b ^ c ^ d, a, b, x, s, t);
}
function _md5ii(a, b, c, d, x, s, t) {
  return _md5cmn(c ^ (b | ~d), a, b, x, s, t);
}

/** Compute MD5 of a Uint8Array; returns a 16-byte Uint8Array. */
function md5Bytes(input) {
  // Pad to 64-byte boundary: append 0x80, then zeros, then 64-bit little-endian bit length.
  const msgLen = input.length;
  const padLen = (56 - ((msgLen + 1) % 64) + 64) % 64;
  const total = msgLen + 1 + padLen + 8;
  const buf = new Uint8Array(total);
  buf.set(input);
  buf[msgLen] = 0x80;
  const dv = new DataView(buf.buffer);
  const bitLo = (msgLen * 8) >>> 0;
  const bitHi = Math.floor(msgLen / 0x20000000) >>> 0;
  dv.setUint32(total - 8, bitLo, true);
  dv.setUint32(total - 4, bitHi, true);

  let a = 0x67452301,
    b = 0xefcdab89,
    c = 0x98badcfe,
    d = 0x10325476;

  for (let i = 0; i < total; i += 64) {
    const M = new Array(16);
    for (let j = 0; j < 16; j++) M[j] = dv.getInt32(i + j * 4, true);
    let aa = a,
      bb = b,
      cc = c,
      dd = d;

    // Round 1
    aa = _md5ff(aa, bb, cc, dd, M[0], 7, -680876936);
    dd = _md5ff(dd, aa, bb, cc, M[1], 12, -389564586);
    cc = _md5ff(cc, dd, aa, bb, M[2], 17, 606105819);
    bb = _md5ff(bb, cc, dd, aa, M[3], 22, -1044525330);
    aa = _md5ff(aa, bb, cc, dd, M[4], 7, -176418897);
    dd = _md5ff(dd, aa, bb, cc, M[5], 12, 1200080426);
    cc = _md5ff(cc, dd, aa, bb, M[6], 17, -1473231341);
    bb = _md5ff(bb, cc, dd, aa, M[7], 22, -45705983);
    aa = _md5ff(aa, bb, cc, dd, M[8], 7, 1770035416);
    dd = _md5ff(dd, aa, bb, cc, M[9], 12, -1958414417);
    cc = _md5ff(cc, dd, aa, bb, M[10], 17, -42063);
    bb = _md5ff(bb, cc, dd, aa, M[11], 22, -1990404162);
    aa = _md5ff(aa, bb, cc, dd, M[12], 7, 1804603682);
    dd = _md5ff(dd, aa, bb, cc, M[13], 12, -40341101);
    cc = _md5ff(cc, dd, aa, bb, M[14], 17, -1502002290);
    bb = _md5ff(bb, cc, dd, aa, M[15], 22, 1236535329);
    // Round 2
    aa = _md5gg(aa, bb, cc, dd, M[1], 5, -165796510);
    dd = _md5gg(dd, aa, bb, cc, M[6], 9, -1069501632);
    cc = _md5gg(cc, dd, aa, bb, M[11], 14, 643717713);
    bb = _md5gg(bb, cc, dd, aa, M[0], 20, -373897302);
    aa = _md5gg(aa, bb, cc, dd, M[5], 5, -701558691);
    dd = _md5gg(dd, aa, bb, cc, M[10], 9, 38016083);
    cc = _md5gg(cc, dd, aa, bb, M[15], 14, -660478335);
    bb = _md5gg(bb, cc, dd, aa, M[4], 20, -405537848);
    aa = _md5gg(aa, bb, cc, dd, M[9], 5, 568446438);
    dd = _md5gg(dd, aa, bb, cc, M[14], 9, -1019803690);
    cc = _md5gg(cc, dd, aa, bb, M[3], 14, -187363961);
    bb = _md5gg(bb, cc, dd, aa, M[8], 20, 1163531501);
    aa = _md5gg(aa, bb, cc, dd, M[13], 5, -1444681467);
    dd = _md5gg(dd, aa, bb, cc, M[2], 9, -51403784);
    cc = _md5gg(cc, dd, aa, bb, M[7], 14, 1735328473);
    bb = _md5gg(bb, cc, dd, aa, M[12], 20, -1926607734);
    // Round 3
    aa = _md5hh(aa, bb, cc, dd, M[5], 4, -378558);
    dd = _md5hh(dd, aa, bb, cc, M[8], 11, -2022574463);
    cc = _md5hh(cc, dd, aa, bb, M[11], 16, 1839030562);
    bb = _md5hh(bb, cc, dd, aa, M[14], 23, -35309556);
    aa = _md5hh(aa, bb, cc, dd, M[1], 4, -1530992060);
    dd = _md5hh(dd, aa, bb, cc, M[4], 11, 1272893353);
    cc = _md5hh(cc, dd, aa, bb, M[7], 16, -155497632);
    bb = _md5hh(bb, cc, dd, aa, M[10], 23, -1094730640);
    aa = _md5hh(aa, bb, cc, dd, M[13], 4, 681279174);
    dd = _md5hh(dd, aa, bb, cc, M[0], 11, -358537222);
    cc = _md5hh(cc, dd, aa, bb, M[3], 16, -722521979);
    bb = _md5hh(bb, cc, dd, aa, M[6], 23, 76029189);
    aa = _md5hh(aa, bb, cc, dd, M[9], 4, -640364487);
    dd = _md5hh(dd, aa, bb, cc, M[12], 11, -421815835);
    cc = _md5hh(cc, dd, aa, bb, M[15], 16, 530742520);
    bb = _md5hh(bb, cc, dd, aa, M[2], 23, -995338651);
    // Round 4
    aa = _md5ii(aa, bb, cc, dd, M[0], 6, -198630844);
    dd = _md5ii(dd, aa, bb, cc, M[7], 10, 1126891415);
    cc = _md5ii(cc, dd, aa, bb, M[14], 15, -1416354905);
    bb = _md5ii(bb, cc, dd, aa, M[5], 21, -57434055);
    aa = _md5ii(aa, bb, cc, dd, M[12], 6, 1700485571);
    dd = _md5ii(dd, aa, bb, cc, M[3], 10, -1894986606);
    cc = _md5ii(cc, dd, aa, bb, M[10], 15, -1051523);
    bb = _md5ii(bb, cc, dd, aa, M[1], 21, -2054922799);
    aa = _md5ii(aa, bb, cc, dd, M[8], 6, 1873313359);
    dd = _md5ii(dd, aa, bb, cc, M[15], 10, -30611744);
    cc = _md5ii(cc, dd, aa, bb, M[6], 15, -1560198380);
    bb = _md5ii(bb, cc, dd, aa, M[13], 21, 1309151649);
    aa = _md5ii(aa, bb, cc, dd, M[4], 6, -145523070);
    dd = _md5ii(dd, aa, bb, cc, M[11], 10, -1120210379);
    cc = _md5ii(cc, dd, aa, bb, M[2], 15, 718787259);
    bb = _md5ii(bb, cc, dd, aa, M[9], 21, -343485551);

    a = _md5safeAdd(a, aa);
    b = _md5safeAdd(b, bb);
    c = _md5safeAdd(c, cc);
    d = _md5safeAdd(d, dd);
  }

  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setInt32(0, a, true);
  odv.setInt32(4, b, true);
  odv.setInt32(8, c, true);
  odv.setInt32(12, d, true);
  return out;
}

const _enc = new TextEncoder();

/** MD5 hex of a string or Uint8Array. */
function md5Hex(data) {
  const bytes = typeof data === "string" ? _enc.encode(data) : data;
  return toHex(md5Bytes(bytes));
}

/** HMAC-MD5: key and data are both Uint8Array; returns Uint8Array (16 bytes). */
function hmacMd5(key, data) {
  const BLOCK = 64;
  let k = key.length > BLOCK ? md5Bytes(key) : key;
  const kp = new Uint8Array(BLOCK);
  kp.set(k);
  const ipad = kp.map((b) => b ^ 0x36);
  const opad = kp.map((b) => b ^ 0x5c);
  const inner = new Uint8Array(BLOCK + data.length);
  inner.set(ipad);
  inner.set(data, BLOCK);
  const outer = new Uint8Array(BLOCK + 16);
  outer.set(opad);
  outer.set(md5Bytes(inner), BLOCK);
  return md5Bytes(outer);
}

// =============================================================================
// Binary / Base64 helpers  (replace Node Buffer)
// =============================================================================

function toHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function b64Decode(str) {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function b64Encode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function byteLength(str) {
  return _enc.encode(str).length;
}

// =============================================================================
// Constants
// =============================================================================

const SECRET_KEY_DEFAULT_BUILTIN = "76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O";
const SECRET_KEY_ALT_BUILTIN = "Xqn2nnO41/L92o1iuXhSLHTbXvY4Z5ZZ62m8mSLA";

const HOST_POOL = [
  "https://api6.aoneroom.com",
  "https://api5.aoneroom.com",
  "https://api4.aoneroom.com",
  "https://api4sg.aoneroom.com",
  "https://api3.aoneroom.com",
  "https://api6sg.aoneroom.com",
  "https://api.inmoviebox.com",
];

const DEFAULT_API_BASE = HOST_POOL[0];
const MAIN_PAGE_PATH = "/wefeed-mobile-bff/tab-operating";
const SEARCH_PATH = "/wefeed-mobile-bff/subject-api/search";
const SEARCH_PATH_V2 = "/wefeed-mobile-bff/subject-api/search/v2";
const SUBJECT_GET_PATH = "/wefeed-mobile-bff/subject-api/get";
const SEASON_INFO_PATH = "/wefeed-mobile-bff/subject-api/season-info";
const PLAY_INFO_PATH = "/wefeed-mobile-bff/subject-api/play-info";
const RESOURCE_PATH = "/wefeed-mobile-bff/subject-api/resource";
const EXT_CAPTIONS_PATH = "/wefeed-mobile-bff/subject-api/get-ext-captions";
const SIGNATURE_BODY_MAX_BYTES = 102_400;
const RETRY_STATUS_CODES = new Set([403, 407, 429, 500, 502, 503, 504]);
const RESULTS_PER_PAGE = 20;
const VALID_SUBJECT_ID = /^\d{17,21}$/;

const SubjectType = Object.freeze({
  ALL: 0,
  MOVIES: 1,
  TV_SERIES: 2,
  EDUCATION: 5,
  MUSIC: 6,
  ANIME: 7,
  OTHER: 8,
});

const DOWNLOAD_REQUEST_HEADERS = {
  Accept: "*/*",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0",
  Origin: "https://h5.aoneroom.com",
  Referer: "https://fmoviesunblocked.net/",
};

// =============================================================================
// Android client-info generator  (random identity per isolate startup)
// =============================================================================

const _ANDROID_VERSIONS = [
  { version: "9", build: "PQ3A.190605.03081104" },
  { version: "10", build: "QP1A.191005.007.A3" },
  { version: "11", build: "RP1A.200720.011" },
  { version: "12", build: "S1B.220414.015" },
  { version: "13", build: "TQ2A.230405.003" },
];
const _REDMI_DEVICES = [
  { model: "23078RKD5C", brand: "Redmi" },
  { model: "2201117TY", brand: "Redmi" },
  { model: "2201117TG", brand: "Redmi" },
  { model: "22101316G", brand: "Redmi" },
  { model: "21121210G", brand: "Redmi" },
  { model: "M2012K11AG", brand: "Redmi" },
  { model: "M2007J20CG", brand: "Redmi" },
];
const _VERSION_CODES = [50020042, 50020043, 50020044, 50020045, 50020046];
const _NETWORK_TYPES = ["NETWORK_WIFI", "NETWORK_MOBILE"];
const _TIMEZONES = [
  "Asia/Kolkata",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "America/New_York",
  "Europe/London",
];

function _pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function _randomHex(len) {
  const buf = new Uint8Array(Math.ceil(len / 2));
  crypto.getRandomValues(buf);
  return toHex(buf).slice(0, len);
}

function _generateClientInfo() {
  const android = _pick(_ANDROID_VERSIONS);
  const device = _pick(_REDMI_DEVICES);
  const versionCode = _pick(_VERSION_CODES);
  const network = _pick(_NETWORK_TYPES);
  const timezone = _pick(_TIMEZONES);
  const gaid = crypto.randomUUID();
  const deviceId = _randomHex(32);

  const userAgent =
    `com.community.oneroom/${versionCode} ` +
    `(Linux; U; Android ${android.version}; en_US; ` +
    `${device.model}; Build/${android.build}; Cronet/135.0.7012.3)`;

  const clientInfo = JSON.stringify({
    package_name: "com.community.oneroom",
    version_name: "3.0.03.0529.03",
    version_code: versionCode,
    os: "android",
    os_version: android.version,
    install_ch: "ps",
    device_id: deviceId,
    install_store: "ps",
    gaid,
    brand: device.brand,
    model: device.model,
    system_language: "en",
    net: network,
    region: "US",
    timezone,
    sp_code: "40401",
    "X-Play-Mode": "2",
  });

  return { userAgent, clientInfo };
}

// Lazily initialised on the first request (global scope forbids crypto in Workers).
let _USER_AGENT = null;
let _CLIENT_INFO = null;
function _ensureClientInfo() {
  if (!_USER_AGENT) {
    const info = _generateClientInfo();
    _USER_AGENT = info.userAgent;
    _CLIENT_INFO = info.clientInfo;
  }
}

// =============================================================================
// Request signing  (mirrors crypto.js)
// =============================================================================

function generateXClientToken(timestampMs) {
  const ts = String(timestampMs !== undefined ? timestampMs : Date.now());
  const reversed = ts.split("").reverse().join("");
  return `${ts},${md5Hex(reversed)}`;
}

function _sortedQueryString(url) {
  let sp;
  try {
    sp = new URL(url).searchParams;
  } catch {
    const safe = url.startsWith("/") ? `http://x${url}` : `http://x/${url}`;
    sp = new URL(safe).searchParams;
  }
  const map = {};
  for (const [k, v] of sp) {
    (map[k] = map[k] || []).push(v);
  }
  const parts = [];
  for (const key of Object.keys(map).sort()) {
    for (const val of map[key]) parts.push(`${key}=${val}`);
  }
  return parts.join("&");
}

function buildCanonicalString(
  method,
  accept,
  contentType,
  url,
  body,
  timestampMs,
) {
  let path = "",
    query = "";
  try {
    const parsed = new URL(url);
    path = parsed.pathname || "";
    query = _sortedQueryString(url);
  } catch {
    const idx = url.indexOf("?");
    path = idx >= 0 ? url.slice(0, idx) : url;
    query = idx >= 0 ? _sortedQueryString(url) : "";
  }
  const canonicalUrl = query ? `${path}?${query}` : path;

  let bodyHash = "",
    bodyLength = "";
  if (body !== null && body !== undefined) {
    const bodyBytes = _enc.encode(body);
    const truncated = bodyBytes.slice(0, SIGNATURE_BODY_MAX_BYTES);
    bodyHash = md5Hex(truncated);
    bodyLength = String(bodyBytes.length);
  }

  return [
    method.toUpperCase(),
    accept || "",
    contentType || "",
    bodyLength,
    String(timestampMs),
    bodyHash,
    canonicalUrl,
  ].join("\n");
}

function generateXTrSignature(
  method,
  accept,
  contentType,
  url,
  body = null,
  useAltKey = false,
  timestampMs = null,
  secretKeyDefault,
  secretKeyAlt,
) {
  const ts = timestampMs !== null ? timestampMs : Date.now();
  const canonical = buildCanonicalString(
    method,
    accept,
    contentType,
    url,
    body,
    ts,
  );
  const secretB64 = useAltKey ? secretKeyAlt : secretKeyDefault;
  const secretKey = b64Decode(secretB64);
  const mac = hmacMd5(secretKey, _enc.encode(canonical));
  return `${ts}|2|${b64Encode(mac)}`;
}

function buildSignedHeaders({
  method,
  url,
  accept = "application/json",
  contentType = "application/json",
  body = null,
  includePlayMode = false,
  authToken = null,
  secretKeyDefault,
  secretKeyAlt,
}) {
  const ts = Date.now();
  const headers = {
    "User-Agent": _USER_AGENT,
    Accept: accept,
    "Content-Type": contentType,
    Connection: "keep-alive",
    "X-Client-Token": generateXClientToken(ts),
    "x-tr-signature": generateXTrSignature(
      method,
      accept,
      contentType,
      url,
      body,
      false,
      ts,
      secretKeyDefault,
      secretKeyAlt,
    ),
    "X-Client-Info": _CLIENT_INFO,
    "X-Client-Status": "0",
  };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  if (includePlayMode) headers["X-Play-Mode"] = "2";
  return headers;
}

// =============================================================================
// MovieBoxClient  (mirrors client.js – uses native fetch)
// =============================================================================

class MovieBoxClient {
  constructor(opts = {}) {
    this.hostPool = opts.hostPool || HOST_POOL;
    this.activeBase = DEFAULT_API_BASE;
    this.runtimeToken = null;
    this.timeout = opts.timeout || 20_000;
    this.secretKeyDefault = opts.secretKeyDefault || SECRET_KEY_DEFAULT_BUILTIN;
    this.secretKeyAlt = opts.secretKeyAlt || SECRET_KEY_ALT_BUILTIN;
    this.authToken = opts.authToken || null;
  }

  get _effectiveToken() {
    return this.runtimeToken || this.authToken;
  }

  _absorbXUser(headers) {
    const raw = headers.get("x-user");
    if (!raw) return;
    try {
      const p = JSON.parse(raw);
      if (p && p.token) this.runtimeToken = p.token;
    } catch {
      /* ignore */
    }
  }

  static _mergeParams(path, params) {
    if (!params || Object.keys(params).length === 0) return path;
    const qIdx = path.indexOf("?");
    const base = qIdx >= 0 ? path.slice(0, qIdx) : path;
    const sp =
      qIdx >= 0
        ? new URLSearchParams(path.slice(qIdx + 1))
        : new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) sp.set(String(k), String(v));
    }
    return `${base}?${sp.toString()}`;
  }

  async _request(method, pathAndQuery, opts = {}) {
    const {
      accept = "application/json",
      contentType = "application/json",
      body = null,
      includePlayMode = false,
    } = opts;

    let lastResponse = null;
    let lastError = null;

    for (const base of this.hostPool) {
      const url = `${base}${pathAndQuery}`;
      const headers = buildSignedHeaders({
        method,
        url,
        accept,
        contentType,
        body,
        includePlayMode,
        authToken: this._effectiveToken,
        secretKeyDefault: this.secretKeyDefault,
        secretKeyAlt: this.secretKeyAlt,
      });

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);
        const fetchOpts = {
          method: method.toUpperCase(),
          headers,
          signal: controller.signal,
        };
        if (body) fetchOpts.body = body;

        const response = await fetch(url, fetchOpts);
        clearTimeout(timer);
        this._absorbXUser(response.headers);
        lastResponse = response;

        if (!RETRY_STATUS_CODES.has(response.status)) {
          this.activeBase = base;
          return { base, response };
        }
        await response.text().catch(() => {});
      } catch (err) {
        lastError = err;
      }
    }

    if (!lastResponse) {
      throw new Error(
        `All hosts failed for ${pathAndQuery}. Last: ${lastError?.message || "unknown"}`,
      );
    }
    return { base: this.activeBase, response: lastResponse };
  }

  async _processApiResponse(response) {
    const ct = response.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const body = await response.text().catch(() => "<unreadable>");
      throw new Error(
        `Unexpected content-type '${ct}' (HTTP ${response.status}): ${body}`,
      );
    }
    const json = await response.json();
    if (json.code === 0 && json.message === "ok") return json.data;
    throw new Error(
      `API error – code: ${json.code}, message: ${json.message} (HTTP ${response.status})`,
    );
  }

  async getFromApi(path, params) {
    const fullPath = params ? MovieBoxClient._mergeParams(path, params) : path;
    const { response } = await this._request("GET", fullPath);
    return this._processApiResponse(response);
  }

  async postToApi(path, body, params) {
    const fullPath = params ? MovieBoxClient._mergeParams(path, params) : path;
    const bodyStr = JSON.stringify(body);
    const { response } = await this._request("POST", fullPath, {
      contentType: "application/json; charset=utf-8",
      body: bodyStr,
    });
    return this._processApiResponse(response);
  }

  async getRawStream(url, headers = {}, timeoutMs = 30_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    return response;
  }
}

// =============================================================================
// Core API  (mirrors core.js)
// =============================================================================

async function getHomepage(client, tabId = 0, page = 1) {
  return client.getFromApi(MAIN_PAGE_PATH, { page, tabId, version: "" });
}

async function searchV2(
  client,
  query,
  subjectType = SubjectType.ALL,
  tabId = "All",
  page = 1,
  perPage = RESULTS_PER_PAGE,
) {
  const data = await client.postToApi(SEARCH_PATH_V2, {
    keyword: query,
    page,
    perPage,
    subjectType,
    tabId,
  });
  data.items = data.results?.[0]?.subjects ?? [];
  return data;
}

async function searchV1(
  client,
  query,
  subjectType = SubjectType.ALL,
  page = 1,
  perPage = RESULTS_PER_PAGE,
) {
  return client.postToApi(SEARCH_PATH, {
    keyword: query,
    page,
    perPage,
    subjectType,
  });
}

async function getItemDetails(client, subjectId) {
  return client.getFromApi(SUBJECT_GET_PATH, { subjectId });
}

async function getSeasonDetails(client, subjectId) {
  return client.getFromApi(SEASON_INFO_PATH, { subjectId });
}

async function getResources(
  client,
  subjectId,
  se = 0,
  ep = 0,
  resolution = 0,
  page = 1,
  perPage = RESULTS_PER_PAGE,
) {
  return client.getFromApi(RESOURCE_PATH, {
    subjectId,
    se,
    ep,
    resolution,
    page,
    perPage,
  });
}

async function getPlayInfo(client, subjectId, se = 0, ep = 0) {
  return client.getFromApi(PLAY_INFO_PATH, { subjectId, se, ep });
}

async function getCaptions(client, subjectId, resourceId) {
  return client.getFromApi(EXT_CAPTIONS_PATH, { subjectId, resourceId });
}

function normalizeDubName(name) {
  if (!name) return name;
  if (name.toLowerCase().startsWith("original")) return "Original";
  return name.replace(/dub/gi, "").trim();
}

function findDub(dubs, langNameOrCode) {
  const needle = langNameOrCode.trim();
  return (
    dubs.find(
      (d) =>
        normalizeDubName(d.lanName) === needle ||
        d.lanName === needle ||
        d.lanCode?.toLowerCase() === needle.toLowerCase(),
    ) ?? null
  );
}

async function resolveSlug(client, slug) {
  const parts = slug.split("-");
  const lastSeg = parts[parts.length - 1];
  const queryParts = /^[A-Za-z0-9]{8,14}$/.test(lastSeg)
    ? parts.slice(0, -1)
    : parts;
  const query = queryParts.join(" ");
  const data = await searchV2(client, query, SubjectType.ALL, "All", 1, 20);
  const subjects = [];
  for (const group of data.results ?? []) {
    if (Array.isArray(group.subjects)) subjects.push(...group.subjects);
  }
  for (const s of subjects) {
    if (s.detailUrl && s.detailUrl.split("/").pop() === slug)
      return s.subjectId;
  }
  const querySlug = queryParts.join("-").toLowerCase();
  for (const s of subjects) {
    const titleSlug = (s.title ?? "")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    if (titleSlug === querySlug) return s.subjectId;
  }
  throw new Error(
    `Could not resolve slug '${slug}'. Try passing ?id=<subjectId> directly.`,
  );
}

// =============================================================================
// Server helpers
// =============================================================================

function jsonOk(data, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

function jsonFail(err, status = 500) {
  const message = err instanceof Error ? err.message : String(err);
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

/**
 * Normalise a raw API item into a card-compatible shape so all section types
 * produce a consistent { subjectId, title, cover, detailUrl, ... } object.
 */
function _normaliseItem(raw) {
  if (!raw) return null;
  // Already a proper subject (has cover + title at top level)
  if (raw.cover || raw.title) return raw;
  // CUSTOM section item: has image + subjectId, subject may be null
  const out = { ...raw };
  if (!out.cover && raw.image && raw.image.url) {
    out.cover = { url: raw.image.url };
  }
  // Use subject data if present and richer
  if (raw.subject && (raw.subject.title || raw.subject.cover)) {
    return { ...raw.subject, ...out, cover: raw.subject.cover || out.cover };
  }
  return out;
}

function normalizeSections(data) {
  return (data.items || []).map((item) => {
    // Priority 1: subjects array (standard sections)
    let items = item.subjects && item.subjects.length ? item.subjects : [];

    // Priority 2: CUSTOM sections keep items in customData.items
    if (
      !items.length &&
      item.type === "CUSTOM" &&
      item.customData &&
      item.customData.items
    ) {
      items = item.customData.items
        .map(_normaliseItem)
        .filter((i) => i && i.subjectId);
    }

    // Priority 3: BANNER sections keep items inside banner.banners
    if (
      !items.length &&
      item.type === "BANNER" &&
      item.banner &&
      item.banner.banners
    ) {
      items = item.banner.banners
        .map((b) => _normaliseItem(b.subject || b))
        .filter(Boolean);
    }

    return {
      name: item.title || "",
      type: item.type || "",
      position: item.position ?? 0,
      items,
      banner: item.banner || null,
      rankings: item.rankings || [],
    };
  });
}

function findSection(sections, name) {
  const target = name.toLowerCase();
  return sections.find((s) => s.name.toLowerCase() === target) || null;
}

function pickVideoFile(list, resolution) {
  if (!list || list.length === 0) throw new Error("No stream files available");
  if (resolution === 0)
    return list.reduce((best, cur) =>
      cur.resolution > best.resolution ? cur : best,
    );
  const exact = list.find((f) => f.resolution === resolution);
  if (exact) return exact;
  const below = list.filter((f) => f.resolution <= resolution);
  if (below.length > 0)
    return below.reduce((best, cur) =>
      cur.resolution > best.resolution ? cur : best,
    );
  return list.reduce((min, cur) =>
    cur.resolution < min.resolution ? cur : min,
  );
}

// =============================================================================
// Simple URL router
// =============================================================================

/**
 * Matches a URL pathname against a pattern with named :params.
 * Returns a params object on match, or null on miss.
 */
function matchPath(pattern, pathname) {
  const patParts = pattern.split("/");
  const urlParts = pathname.split("/");
  if (patParts.length !== urlParts.length) return null;
  const params = {};
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i].startsWith(":")) {
      params[patParts[i].slice(1)] = decodeURIComponent(urlParts[i]);
    } else if (patParts[i] !== urlParts[i]) {
      return null;
    }
  }
  return params;
}

// =============================================================================
// Route handlers
// =============================================================================

// ── Homepage tab helpers ─────────────────────────────────────────────────────

async function handleFull(client, tabId) {
  const data = await getHomepage(client, tabId);
  return jsonOk(data);
}

async function handleSections(client, tabId) {
  const data = await getHomepage(client, tabId);
  const sections = normalizeSections(data).map((s) => ({
    name: s.name,
    type: s.type,
    count: s.items.length,
  }));
  return jsonOk(sections);
}

async function handleSectionByName(client, tabId, name) {
  const data = await getHomepage(client, tabId);
  const section = findSection(normalizeSections(data), name);
  if (!section) return jsonFail(new Error(`Section '${name}' not found`), 404);
  return jsonOk(section);
}

// ── /home/* ──────────────────────────────────────────────────────────────────

async function handleHomeBanner(client, tabId) {
  const data = await getHomepage(client, tabId);
  const sections = normalizeSections(data).filter((s) => s.type === "BANNER");
  return jsonOk(sections);
}

async function handleHomeTrending(client, tabId) {
  const data = await getHomepage(client, tabId);
  const sections = normalizeSections(data).filter((s) =>
    s.name.toLowerCase().includes("trending"),
  );
  return jsonOk(sections);
}

async function handleHomeHot(client, tabId) {
  const data = await getHomepage(client, tabId);
  const sections = normalizeSections(data).filter((s) =>
    s.name.toLowerCase().includes("hot"),
  );
  return jsonOk(sections);
}

async function handleHomeCinema(client, tabId) {
  const data = await getHomepage(client, tabId);
  const sections = normalizeSections(data).filter((s) =>
    s.name.toLowerCase().includes("cinema"),
  );
  return jsonOk(sections);
}

// ── /play-info/:subject_id ────────────────────────────────────────────────────

async function handlePlayInfo(client, req) {
  const { params, url } = req;
  const { subject_id } = params;
  if (!VALID_SUBJECT_ID.test(subject_id))
    return jsonFail(new Error("Invalid subject_id format"), 400);

  const se = parseInt(url.searchParams.get("se") || "0", 10);
  const ep = parseInt(url.searchParams.get("ep") || "0", 10);
  const dub = url.searchParams.get("dub") || "";

  let effectiveId = subject_id,
    dubInfo = null;
  if (dub) {
    const details = await getItemDetails(client, subject_id);
    const dubMatch = findDub(details.dubs || [], dub);
    if (!dubMatch) {
      const available = (details.dubs || []).map(
        (d) => `${normalizeDubName(d.lanName)} (${d.lanCode})`,
      );
      return jsonFail(
        new Error(
          `Dub '${dub}' not found. Available: ${available.join(", ") || "none"}`,
        ),
        404,
      );
    }
    effectiveId = dubMatch.subjectId;
    dubInfo = {
      lanName: normalizeDubName(dubMatch.lanName),
      lanCode: dubMatch.lanCode,
    };
  }

  const data = await getPlayInfo(client, effectiveId, se, ep);
  return jsonOk({
    subject_id,
    effective_subject_id: effectiveId,
    dub: dubInfo,
    ...data,
  });
}

// ── /resolutions/:subject_id ──────────────────────────────────────────────────

async function handleResolutions(client, req) {
  const { subject_id } = req.params;
  if (!VALID_SUBJECT_ID.test(subject_id))
    return jsonFail(new Error("Invalid subject_id format"), 400);

  const data = await getResources(client, subject_id, 0, 0, 0);
  const qualities = (data.collectionResolutions || []).map((r) => ({
    resolution: r.resolution,
    label: `${r.resolution}p`,
    averageSize: r.averageSize,
    episodeCount: r.epNum,
    requireMemberType: r.requireMemberType,
    memberIcon: r.memberIcon,
  }));
  return jsonOk({ subject_id, qualities });
}

// ── /dubs/:subject_id ─────────────────────────────────────────────────────────

async function handleDubs(client, req) {
  const { subject_id } = req.params;
  if (!VALID_SUBJECT_ID.test(subject_id))
    return jsonFail(new Error("Invalid subject_id format"), 400);

  const details = await getItemDetails(client, subject_id);
  const dubs = (details.dubs || []).map((d) => ({
    subjectId: d.subjectId,
    lanName: normalizeDubName(d.lanName),
    lanCode: d.lanCode,
    original: d.original,
  }));
  return jsonOk({ subject_id, dubs });
}

// ── /subtitles/proxy ─────────────────────────────────────────────────────────

async function handleSubtitleProxy(urlObj) {
  const raw = urlObj.searchParams.get("url");
  if (!raw) return jsonFail(new Error("Missing query param: url"), 400);

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return jsonFail(new Error("Invalid url"), 400);
  }

  const allowed = ["hakunaymatata.com", "aoneroom.com", "pbcdn.aoneroom.com"];
  if (
    !allowed.some(
      (d) => parsed.hostname === d || parsed.hostname.endsWith("." + d),
    )
  )
    return jsonFail(new Error("URL not from an allowed subtitle CDN"), 403);

  const upstream = await fetch(raw, {
    headers: { "User-Agent": DOWNLOAD_REQUEST_HEADERS["User-Agent"] },
  });

  const isSrt =
    /\.srt($|[?#])/i.test(raw) ||
    (upstream.headers.get("content-type") || "").includes("text/plain");

  const corsHeaders = {
    "access-control-allow-origin": "*",
  };

  if (isSrt && upstream.body) {
    const text = await upstream.text();
    const vtt =
      "WEBVTT\n\n" + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
    return new Response(vtt, {
      status: upstream.status,
      headers: {
        ...corsHeaders,
        "content-type": "text/vtt; charset=utf-8",
        "content-length": String(byteLength(vtt)),
      },
    });
  }

  // Pass through – stream body directly (zero-buffer)
  const ct = upstream.headers.get("content-type");
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { ...corsHeaders, ...(ct ? { "content-type": ct } : {}) },
  });
}

// ── /subtitles/:subject_id ────────────────────────────────────────────────────

async function handleSubtitleLanguages(client, req) {
  const { subject_id } = req.params;
  if (!VALID_SUBJECT_ID.test(subject_id))
    return jsonFail(new Error("Invalid subject_id format"), 400);

  const details = await getItemDetails(client, subject_id);
  const raw = details.subtitles || [];
  const languages = Array.isArray(raw)
    ? raw
    : raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  return jsonOk({ subject_id, subtitle_languages: languages });
}

// ── /subtitles/:subject_id/:resource_id ──────────────────────────────────────

async function handleSubtitleCaptions(client, req) {
  const { subject_id, resource_id } = req.params;
  if (!VALID_SUBJECT_ID.test(subject_id))
    return jsonFail(new Error("Invalid subject_id format"), 400);

  const data = await getCaptions(client, subject_id, resource_id);
  const captions = (data.extCaptions || []).map((c) => ({
    id: c.id,
    lan: c.lan,
    lanName: c.lanName,
    url: c.url,
    size: c.size,
    delay: c.delay,
  }));
  return jsonOk({ subject_id, resource_id, captions });
}

// ── /search ───────────────────────────────────────────────────────────────────

async function handleSearch(client, url) {
  const q = url.searchParams.get("q");
  if (!q) return jsonFail(new Error("Missing query param: q"), 400);
  const pg = parseInt(url.searchParams.get("page") || "1", 10);
  const perPage = Math.min(
    parseInt(url.searchParams.get("per_page") || "20", 10),
    20,
  );
  const ver = url.searchParams.get("version") || "2";
  const data =
    ver === "1"
      ? await searchV1(client, q, SubjectType.ALL, pg, perPage)
      : await searchV2(client, q, SubjectType.ALL, "All", pg, perPage);
  return jsonOk(data);
}

async function handleSearchSuggest(client, url) {
  const q = url.searchParams.get("q");
  if (!q) return jsonFail(new Error("Missing query param: q"), 400);
  const data = await searchV2(client, q, SubjectType.ALL, "All", 1, 8);
  const suggestions = data.items.map((s) => ({
    title: s.title,
    subjectId: s.subjectId,
    subjectType: s.subjectType,
    releaseDate: s.releaseDate,
    coverUrl: s.cover?.url ?? null,
    detailUrl: s.detailUrl ?? null,
  }));
  return jsonOk(suggestions);
}

// ── /detail/:slug / /episodes/:slug ──────────────────────────────────────────

async function handleDetail(client, req) {
  const subjectId =
    req.url.searchParams.get("id")?.trim() ||
    (await resolveSlug(client, req.params.slug));
  const details = await getItemDetails(client, subjectId);

  if (details.subjectType === SubjectType.TV_SERIES) {
    try {
      details.seasons = await getSeasonDetails(client, subjectId);
    } catch {
      /* non-fatal */
    }
  }

  try {
    const resources = await getResources(client, subjectId, 0, 0, 0);
    details.streams = (resources.list || []).map((f) => ({
      url: f.resourceLink,
      resolution: f.resolution,
      season: f.se,
      episode: f.ep,
      size: f.size,
      duration: f.duration,
      codec: f.codecName,
    }));
  } catch {
    details.streams = [];
  }

  return jsonOk(details);
}

async function handleEpisodes(client, req) {
  const subjectId =
    req.url.searchParams.get("id")?.trim() ||
    (await resolveSlug(client, req.params.slug));
  const seasons = await getSeasonDetails(client, subjectId);
  return jsonOk(seasons);
}

// ── /api/stream/:subject_id ───────────────────────────────────────────────────

async function handleStream(client, req) {
  const { subject_id } = req.params;
  if (!VALID_SUBJECT_ID.test(subject_id))
    return jsonFail(new Error("Invalid subject_id format"), 400);

  const se = parseInt(req.url.searchParams.get("se") || "0", 10);
  const ep = parseInt(req.url.searchParams.get("ep") || "0", 10);
  const resolution = parseInt(
    req.url.searchParams.get("resolution") || "0",
    10,
  );
  const dub = req.url.searchParams.get("dub") || "";

  let effectiveId = subject_id,
    dubInfo = null;
  if (dub) {
    const details = await getItemDetails(client, subject_id);
    const dubMatch = findDub(details.dubs || [], dub);
    if (!dubMatch) {
      const available = (details.dubs || []).map(
        (d) => `${normalizeDubName(d.lanName)} (${d.lanCode})`,
      );
      return jsonFail(
        new Error(
          `Dub '${dub}' not found. Available: ${available.join(", ") || "none"}`,
        ),
        404,
      );
    }
    effectiveId = dubMatch.subjectId;
    dubInfo = {
      lanName: normalizeDubName(dubMatch.lanName),
      lanCode: dubMatch.lanCode,
    };
  }

  const data = await getResources(client, effectiveId, se, ep, 0);
  const list = data.list || [];
  if (list.length === 0)
    return jsonFail(new Error("No streams found for this subject"), 404);

  const filtered =
    se || ep
      ? list.filter(
          (f) => (se ? f.se === se : true) && (ep ? f.ep === ep : true),
        )
      : list;

  const sorted = [...filtered].sort((a, b) => b.resolution - a.resolution);
  const streams = resolution ? [pickVideoFile(filtered, resolution)] : sorted;

  return jsonOk({
    subject_id,
    effective_subject_id: effectiveId,
    dub: dubInfo,
    subject_type: data.subjectType,
    title: data.subjectTitle,
    streams: streams.map((f) => ({
      url: f.resourceLink,
      sourceUrl: f.sourceUrl,
      resourceId: f.resourceId,
      linkType: f.linkType,
      resolution: f.resolution,
      season: f.se,
      episode: f.ep,
      size: f.size,
      duration: f.duration,
      codec: f.codecName,
      requireMemberType: f.requireMemberType,
      memberIcon: f.memberIcon,
      embeddedSubtitles: f.extCaptions || [],
    })),
  });
}

// ── /watch/:subject_id  (zero-buffer video proxy) ─────────────────────────────

async function handleWatch(client, req) {
  const { subject_id } = req.params;
  if (!VALID_SUBJECT_ID.test(subject_id))
    return jsonFail(new Error("Invalid subject_id format"), 400);

  const se = parseInt(req.url.searchParams.get("se") || "0", 10);
  const ep = parseInt(req.url.searchParams.get("ep") || "0", 10);
  const resolution = parseInt(
    req.url.searchParams.get("resolution") || "0",
    10,
  );
  const dub = req.url.searchParams.get("dub") || "";

  let effectiveId = subject_id;
  if (dub) {
    const details = await getItemDetails(client, subject_id);
    const dubMatch = findDub(details.dubs || [], dub);
    if (!dubMatch) {
      const available = (details.dubs || []).map(
        (d) => `${normalizeDubName(d.lanName)} (${d.lanCode})`,
      );
      return jsonFail(
        new Error(
          `Dub '${dub}' not found. Available: ${available.join(", ") || "none"}`,
        ),
        404,
      );
    }
    effectiveId = dubMatch.subjectId;
  }

  const data = await getResources(client, effectiveId, se, ep, 0);
  const list = data.list || [];
  const files =
    se || ep
      ? list.filter(
          (f) => (se ? f.se === se : true) && (ep ? f.ep === ep : true),
        )
      : list;

  const mediaFile = pickVideoFile(files, resolution);
  const videoUrl = mediaFile.resourceLink;

  const proxyHeaders = { ...DOWNLOAD_REQUEST_HEADERS };
  const range = req.request.headers.get("range");
  if (range) proxyHeaders["Range"] = range;
  const ifRange = req.request.headers.get("if-range");
  if (ifRange) proxyHeaders["If-Range"] = ifRange;
  const ifModified = req.request.headers.get("if-modified-since");
  if (ifModified) proxyHeaders["If-Modified-Since"] = ifModified;

  const upstream = await client.getRawStream(videoUrl, proxyHeaders);

  const FORWARD = [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
    "last-modified",
    "etag",
  ];
  const respHeaders = { "access-control-allow-origin": "*" };
  for (const h of FORWARD) {
    const v = upstream.headers.get(h);
    if (v) respHeaders[h] = v;
  }

  // Pass the upstream ReadableStream directly – zero-buffer, true streaming proxy.
  return new Response(upstream.body, {
    status: upstream.status,
    headers: respHeaders,
  });
}

// =============================================================================
// GET /  –  endpoint index
// =============================================================================

function handleIndex(rawUrl) {
  const base = new URL(rawUrl).origin;

  const endpoints = [
    {
      group: "🏠 Home",
      routes: [
        { method: "GET", path: "/home", description: "Full home tab data" },
        {
          method: "GET",
          path: "/home/sections",
          description: "Section names + item counts",
        },
        {
          method: "GET",
          path: "/home/section/:name",
          description: "Single section by name",
        },
        {
          method: "GET",
          path: "/home/banner",
          description: "Banner sections only",
        },
        {
          method: "GET",
          path: "/home/trending",
          description: "Trending sections",
        },
        { method: "GET", path: "/home/hot", description: "Hot sections" },
        { method: "GET", path: "/home/cinema", description: "Cinema sections" },
      ],
    },
    {
      group: "🎬 Movies",
      routes: [
        { method: "GET", path: "/movies", description: "Full movies tab" },
        {
          method: "GET",
          path: "/movies/sections",
          description: "Movie section names + counts",
        },
        {
          method: "GET",
          path: "/movies/section/:name",
          description: "Single movie section by name",
        },
      ],
    },
    {
      group: "📺 TV Series",
      routes: [
        {
          method: "GET",
          path: "/tv-series",
          description: "Full TV series tab",
        },
        {
          method: "GET",
          path: "/tv-series/sections",
          description: "TV section names + counts",
        },
        {
          method: "GET",
          path: "/tv-series/section/:name",
          description: "Single TV section by name",
        },
      ],
    },
    {
      group: "🎭 Animation",
      routes: [
        {
          method: "GET",
          path: "/animation",
          description: "Full animation tab",
        },
        {
          method: "GET",
          path: "/animation/sections",
          description: "Animation section names + counts",
        },
        {
          method: "GET",
          path: "/animation/section/:name",
          description: "Single animation section by name",
        },
      ],
    },
    {
      group: "🏆 Ranking",
      routes: [
        { method: "GET", path: "/ranking", description: "Full ranking tab" },
        {
          method: "GET",
          path: "/ranking/sections",
          description: "Ranking section names + counts",
        },
        {
          method: "GET",
          path: "/ranking/section/:name",
          description: "Single ranking section by name",
        },
      ],
    },
    {
      group: "🔍 Search",
      routes: [
        {
          method: "GET",
          path: "/search?q=:query",
          description: "Full search (add &version=1 for v1)",
        },
        {
          method: "GET",
          path: "/search/suggest?q=:query",
          description: "Quick-suggest (8 results)",
        },
      ],
    },
    {
      group: "📄 Detail",
      routes: [
        {
          method: "GET",
          path: "/detail/:slug",
          description:
            "Full metadata + streams (add ?id= to skip slug resolution)",
        },
        {
          method: "GET",
          path: "/episodes/:slug",
          description: "Season / episode list",
        },
      ],
    },
    {
      group: "▶️  Stream",
      routes: [
        {
          method: "GET",
          path: "/api/stream/:subject_id",
          description: "JSON list of stream URLs  [?se=&ep=&resolution=&dub=]",
        },
        {
          method: "GET",
          path: "/watch/:subject_id",
          description: "Zero-buffer video proxy   [?se=&ep=&resolution=&dub=]",
        },
      ],
    },
    {
      group: "🎬 Play Info (DASH)",
      routes: [
        {
          method: "GET",
          path: "/play-info/:subject_id",
          description: "MPEG-DASH MPD URL  [?se=&ep=&dub=]",
        },
      ],
    },
    {
      group: "🎚️  Resolutions",
      routes: [
        {
          method: "GET",
          path: "/resolutions/:subject_id",
          description: "Available quality tiers (360p … 1080p)",
        },
      ],
    },
    {
      group: "🎙️  Dubs",
      routes: [
        {
          method: "GET",
          path: "/dubs/:subject_id",
          description: "Available audio tracks / dubs",
        },
      ],
    },
    {
      group: "📝 Subtitles",
      routes: [
        {
          method: "GET",
          path: "/subtitles/:subject_id",
          description: "Available subtitle languages",
        },
        {
          method: "GET",
          path: "/subtitles/:subject_id/:resource_id",
          description: "Subtitle file URLs for a specific resource",
        },
        {
          method: "GET",
          path: "/subtitles/proxy?url=:encoded_url",
          description: "CORS proxy for subtitle files (SRT→VTT auto-converted)",
        },
      ],
    },
  ];

  // ── JSON response ────────────────────────────────────────────────────────
  const json = {
    name: "MovieBox API",
    runtime: "Cloudflare Workers",
    base,
    endpoints: endpoints.map(({ group, routes }) => ({
      group,
      routes: routes.map(({ method, path, description }) => ({
        method,
        url: `${base}${path}`,
        description,
      })),
    })),
  };

  // ── HTML response ────────────────────────────────────────────────────────
  const rows = endpoints
    .map(({ group, routes }) => {
      const routeRows = routes
        .map(
          ({ method, path, description }) =>
            `<tr>
            <td><code class="method">${method}</code></td>
            <td><code>${base}${path}</code></td>
            <td>${description}</td>
          </tr>`,
        )
        .join("");
      return `<tbody><tr><td colspan="3" class="group">${group}</td></tr>${routeRows}</tbody>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MovieBox API</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body   { font-family: system-ui, sans-serif; background: #0f1117; color: #e2e8f0; padding: 2rem; }
    h1     { font-size: 1.8rem; margin-bottom: .25rem; }
    .sub   { color: #94a3b8; font-size: .9rem; margin-bottom: 2rem; }
    .badge { display: inline-block; background: #1e293b; border: 1px solid #334155;
             border-radius: 999px; font-size: .75rem; padding: .15rem .6rem;
             color: #38bdf8; margin-left: .5rem; vertical-align: middle; }
    table  { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem;
             background: #1e293b; border-radius: .5rem; overflow: hidden;
             box-shadow: 0 1px 4px #0004; }
    th     { text-align: left; padding: .6rem 1rem; background: #0f172a;
             color: #94a3b8; font-size: .78rem; text-transform: uppercase;
             letter-spacing: .05em; }
    td     { padding: .55rem 1rem; border-top: 1px solid #334155;
             font-size: .88rem; vertical-align: top; }
    td.group { background: #0f172a; color: #7dd3fc; font-weight: 600;
               font-size: .92rem; padding: .5rem 1rem; border-top: 2px solid #1d4ed8; }
    code   { font-family: "JetBrains Mono", "Fira Code", monospace; font-size: .85em;
             background: #0f172a; padding: .1em .35em; border-radius: .25rem; }
    code.method { color: #34d399; }
    a      { color: #38bdf8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .json-link { float: right; font-size: .82rem; color: #94a3b8; }
    .json-link a { color: #94a3b8; }
  </style>
</head>
<body>
  <h1>🎬 MovieBox API <span class="badge">Cloudflare Workers</span></h1>
  <p class="sub">${base} &nbsp;·&nbsp; All endpoints are <strong>GET</strong> &nbsp;·&nbsp;
     <a href="/?format=json">View as JSON</a></p>
  <table>
    <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
    ${rows}
  </table>
</body>
</html>`;

  const acceptJson = new URL(rawUrl).searchParams.get("format") === "json";
  if (acceptJson) {
    return new Response(JSON.stringify(json, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
      },
    });
  }
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "access-control-allow-origin": "*",
    },
  });
}

// =============================================================================
// Main fetch handler / router
// =============================================================================

async function handleRequest(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "Content-Type",
        "access-control-max-age": "86400",
      },
    });
  }

  if (request.method !== "GET") {
    return jsonFail(new Error("Method Not Allowed"), 405);
  }

  _ensureClientInfo();
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/$/, "") || "/";

  // Tab IDs (can be overridden via Wrangler [vars])
  const TAB_IDS = {
    HOME: parseInt(env.TAB_HOME || "0", 10),
    MOVIE: parseInt(env.TAB_MOVIE || "1", 10),
    TV_SERIES: parseInt(env.TAB_TV || "2", 10),
    ANIMATION: parseInt(env.TAB_ANIMATION || "3", 10),
    RANKING: parseInt(env.TAB_RANKING || "4", 10),
  };

  const client = new MovieBoxClient({
    secretKeyDefault:
      (env.MOVIEBOX_SECRET_KEY_DEFAULT || "").trim() ||
      SECRET_KEY_DEFAULT_BUILTIN,
    secretKeyAlt:
      (env.MOVIEBOX_SECRET_KEY_ALT || "").trim() || SECRET_KEY_ALT_BUILTIN,
    authToken: (env.MOVIEBOX_AUTH_TOKEN || "").trim() || null,
  });

  // Helper to build the context object passed to handlers
  const ctx = (params) => ({ params, url, request });

  try {
    // ── root index ───────────────────────────────────────────────────────────

    if (pathname === "/" || pathname === "") return handleIndex(request.url);

    // ── static-path routes (checked first) ──────────────────────────────────

    if (pathname === "/home") return await handleFull(client, TAB_IDS.HOME);
    if (pathname === "/home/sections")
      return await handleSections(client, TAB_IDS.HOME);
    if (pathname === "/home/banner")
      return await handleHomeBanner(client, TAB_IDS.HOME);
    if (pathname === "/home/trending")
      return await handleHomeTrending(client, TAB_IDS.HOME);
    if (pathname === "/home/hot")
      return await handleHomeHot(client, TAB_IDS.HOME);
    if (pathname === "/home/cinema")
      return await handleHomeCinema(client, TAB_IDS.HOME);

    if (pathname === "/movies") return await handleFull(client, TAB_IDS.MOVIE);
    if (pathname === "/movies/sections")
      return await handleSections(client, TAB_IDS.MOVIE);

    if (pathname === "/tv-series")
      return await handleFull(client, TAB_IDS.TV_SERIES);
    if (pathname === "/tv-series/sections")
      return await handleSections(client, TAB_IDS.TV_SERIES);

    if (pathname === "/animation")
      return await handleFull(client, TAB_IDS.ANIMATION);
    if (pathname === "/animation/sections")
      return await handleSections(client, TAB_IDS.ANIMATION);

    if (pathname === "/ranking")
      return await handleFull(client, TAB_IDS.RANKING);
    if (pathname === "/ranking/sections")
      return await handleSections(client, TAB_IDS.RANKING);

    if (pathname === "/search") return await handleSearch(client, url);
    if (pathname === "/search/suggest")
      return await handleSearchSuggest(client, url);

    // /subtitles/proxy must be checked BEFORE /subtitles/:subject_id
    if (pathname === "/subtitles/proxy") return await handleSubtitleProxy(url);

    // ── parameterised routes ─────────────────────────────────────────────────

    let m;

    if ((m = matchPath("/home/section/:name", pathname)))
      return await handleSectionByName(client, TAB_IDS.HOME, m.name);

    if ((m = matchPath("/movies/section/:name", pathname)))
      return await handleSectionByName(client, TAB_IDS.MOVIE, m.name);

    if ((m = matchPath("/tv-series/section/:name", pathname)))
      return await handleSectionByName(client, TAB_IDS.TV_SERIES, m.name);

    if ((m = matchPath("/animation/section/:name", pathname)))
      return await handleSectionByName(client, TAB_IDS.ANIMATION, m.name);

    if ((m = matchPath("/ranking/section/:name", pathname)))
      return await handleSectionByName(client, TAB_IDS.RANKING, m.name);

    if ((m = matchPath("/play-info/:subject_id", pathname)))
      return await handlePlayInfo(client, ctx(m));

    if ((m = matchPath("/resolutions/:subject_id", pathname)))
      return await handleResolutions(client, ctx(m));

    if ((m = matchPath("/dubs/:subject_id", pathname)))
      return await handleDubs(client, ctx(m));

    if ((m = matchPath("/subtitles/:subject_id/:resource_id", pathname)))
      return await handleSubtitleCaptions(client, ctx(m));

    if ((m = matchPath("/subtitles/:subject_id", pathname)))
      return await handleSubtitleLanguages(client, ctx(m));

    if ((m = matchPath("/detail/:slug", pathname)))
      return await handleDetail(client, ctx(m));

    if ((m = matchPath("/episodes/:slug", pathname)))
      return await handleEpisodes(client, ctx(m));

    if ((m = matchPath("/api/stream/:subject_id", pathname)))
      return await handleStream(client, ctx(m));

    if ((m = matchPath("/watch/:subject_id", pathname)))
      return await handleWatch(client, ctx(m));

    // ── 404 ──────────────────────────────────────────────────────────────────
    return jsonFail(new Error(`Unknown route: GET ${pathname}`), 404);
  } catch (err) {
    return jsonFail(err, 500);
  }
}

// =============================================================================
// Workers entry-point
// =============================================================================

export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
};
