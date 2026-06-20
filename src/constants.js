"use strict";

/**
 * constants.js
 * All environment-sensitive values can be overridden via process.env.
 */

const crypto = require("crypto");

// ---------------------------------------------------------------------------
// Secret keys (used in request signing)
// ---------------------------------------------------------------------------

const SECRET_KEY_DEFAULT =
  (process.env.MOVIEBOX_SECRET_KEY_DEFAULT || "").trim() ||
  "76iRl07s0xSN9jqmEWAt79EBJZulIQIsV64FZr2O";

const SECRET_KEY_ALT =
  (process.env.MOVIEBOX_SECRET_KEY_ALT || "").trim() ||
  "Xqn2nnO41/L92o1iuXhSLHTbXvY4Z5ZZ62m8mSLA";

/** Bearer token – normally obtained from the x-user response header at runtime. */
const AUTH_TOKEN = (process.env.MOVIEBOX_AUTH_TOKEN || "").trim() || null;

// ---------------------------------------------------------------------------
// Android API host pool  (same order as Python)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Android API paths
// ---------------------------------------------------------------------------

const MAIN_PAGE_PATH = "/wefeed-mobile-bff/tab-operating";
const SEARCH_PATH = "/wefeed-mobile-bff/subject-api/search";
const SEARCH_PATH_V2 = "/wefeed-mobile-bff/subject-api/search/v2";
const SUBJECT_GET_PATH = "/wefeed-mobile-bff/subject-api/get";
const SEASON_INFO_PATH = "/wefeed-mobile-bff/subject-api/season-info";
/**
 * Returns an MPEG-DASH manifest (MPD) URL for adaptive-bitrate streaming.
 * Equivalent to play_info_url() in urls.py.
 * Params: subjectId, se (season), ep (episode)
 */
const PLAY_INFO_PATH = "/wefeed-mobile-bff/subject-api/play-info";
const RESOURCE_PATH = "/wefeed-mobile-bff/subject-api/resource";
const EXT_CAPTIONS_PATH = "/wefeed-mobile-bff/subject-api/get-ext-captions";

// ---------------------------------------------------------------------------
// Signing constants
// ---------------------------------------------------------------------------

const SIGNATURE_BODY_MAX_BYTES = 102_400;

// HTTP status codes that trigger a retry on the next host
const RETRY_STATUS_CODES = new Set([403, 407, 429, 500, 502, 503, 504]);

// ---------------------------------------------------------------------------
// Pagination defaults
// ---------------------------------------------------------------------------

const RESULTS_PER_PAGE = 20;

// ---------------------------------------------------------------------------
// Subject types  (IntEnum from v1/constants.py)
// ---------------------------------------------------------------------------

/**
 * Maps content category names to their integer API values.
 * subjectType 1 = Movie, 2 = TV Series (confirmed from recon data).
 */
const SubjectType = Object.freeze({
  ALL: 0,
  MOVIES: 1,
  TV_SERIES: 2,
  EDUCATION: 5,
  MUSIC: 6,
  ANIME: 7, // "ShortTV" in app taxonomy
  OTHER: 8,
});

// ---------------------------------------------------------------------------
// Homepage tab IDs  (integer tabId sent to MAIN_PAGE_PATH)
//
// The Android app uses integer tab IDs for its bottom-nav tabs.  The exact
// values are not confirmed without live traffic inspection; override via env
// vars if the defaults produce wrong content for a given tab.
// ---------------------------------------------------------------------------

const TAB_IDS = Object.freeze({
  HOME: parseInt(process.env.TAB_HOME || "0", 10),
  MOVIE: parseInt(process.env.TAB_MOVIE || "1", 10),
  TV_SERIES: parseInt(process.env.TAB_TV || "2", 10),
  ANIMATION: parseInt(process.env.TAB_ANIMATION || "3", 10),
  RANKING: parseInt(process.env.TAB_RANKING || "4", 10),
});

// ---------------------------------------------------------------------------
// Randomised Android client identity  (mirrors _generate_client_info())
// ---------------------------------------------------------------------------

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
  return crypto
    .randomBytes(Math.ceil(len / 2))
    .toString("hex")
    .slice(0, len);
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

  // CLIENT_INFO is a JSON-serialised string sent in the X-Client-Info header.
  // Keep the exact key order and types from the Python source.
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

const { userAgent: USER_AGENT, clientInfo: CLIENT_INFO } =
  _generateClientInfo();

// ---------------------------------------------------------------------------
// Headers used when proxying the raw media stream to the client
// ---------------------------------------------------------------------------

const DOWNLOAD_REQUEST_HEADERS = {
  Accept: "*/*",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0",
  Origin: "https://h5.aoneroom.com",
  Referer: "https://fmoviesunblocked.net/",
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Valid subjectId: 17–21 decimal digits. */
const VALID_SUBJECT_ID = /^\d{17,21}$/;

// ---------------------------------------------------------------------------

const SERVER_PORT = parseInt(process.env.PORT || "8000", 10);

module.exports = {
  SECRET_KEY_DEFAULT,
  SECRET_KEY_ALT,
  AUTH_TOKEN,
  HOST_POOL,
  DEFAULT_API_BASE,
  MAIN_PAGE_PATH,
  SEARCH_PATH,
  SEARCH_PATH_V2,
  SUBJECT_GET_PATH,
  SEASON_INFO_PATH,
  RESOURCE_PATH,
  PLAY_INFO_PATH,
  EXT_CAPTIONS_PATH,
  SERVER_PORT,
  SIGNATURE_BODY_MAX_BYTES,
  RETRY_STATUS_CODES,
  RESULTS_PER_PAGE,
  SubjectType,
  TAB_IDS,
  USER_AGENT,
  CLIENT_INFO,
  DOWNLOAD_REQUEST_HEADERS,
  VALID_SUBJECT_ID,
};
