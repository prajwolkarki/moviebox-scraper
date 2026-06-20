"use strict";

/**
 * core.js
 * Port of src/moviebox_api/v3/core.py.
 *
 * Provides thin async wrappers around each v3 API endpoint.
 * All functions accept a MovieBoxClient instance as their first argument.
 */

const {
  MAIN_PAGE_PATH,
  SEARCH_PATH,
  SEARCH_PATH_V2,
  SUBJECT_GET_PATH,
  SEASON_INFO_PATH,
  PLAY_INFO_PATH,
  RESOURCE_PATH,
  EXT_CAPTIONS_PATH,
  RESULTS_PER_PAGE,
  SubjectType,
} = require("./constants");

// ---------------------------------------------------------------------------
// Homepage  (mirrors core.Homepage)
// ---------------------------------------------------------------------------

/**
 * Fetches the Android app's tab-based homepage.
 *
 * @param {import('./client').MovieBoxClient} client
 * @param {number} [tabId=0]   Integer tab identifier.
 * @param {number} [page=1]
 * @returns {Promise<any>}  Raw `data` object from the API.
 */
async function getHomepage(client, tabId = 0, page = 1) {
  return client.getFromApi(MAIN_PAGE_PATH, { page, tabId, version: "" });
}

// ---------------------------------------------------------------------------
// Search v2  (mirrors core.SearchV2)
// ---------------------------------------------------------------------------

/**
 * Searches for titles using the v2 search endpoint.
 * Normalises the response by hoisting `results[0].subjects` → `items`.
 *
 * @param {import('./client').MovieBoxClient} client
 * @param {string}  query
 * @param {number}  [subjectType]  One of SubjectType.*  (default: ALL = 0)
 * @param {string}  [tabId]        One of the TabID string values (default: 'All')
 * @param {number}  [page]
 * @param {number}  [perPage]
 * @returns {Promise<any>}
 */
async function searchV2(
  client,
  query,
  subjectType = SubjectType.ALL,
  tabId = "All",
  page = 1,
  perPage = RESULTS_PER_PAGE,
) {
  const payload = { keyword: query, page, perPage, subjectType, tabId };
  const data = await client.postToApi(SEARCH_PATH_V2, payload);

  // Hoist the subjects from the first result group for convenience
  data.items = data.results?.[0]?.subjects ?? [];
  return data;
}

// ---------------------------------------------------------------------------
// Item details  (mirrors core.ItemDetails)
// ---------------------------------------------------------------------------

/**
 * Fetches full metadata for a single subject (movie or series).
 *
 * @param {import('./client').MovieBoxClient} client
 * @param {string}  subjectId
 * @returns {Promise<any>}
 */
async function getItemDetails(client, subjectId) {
  return client.getFromApi(SUBJECT_GET_PATH, { subjectId });
}

// ---------------------------------------------------------------------------
// Season details  (mirrors core.SeasonDetails)
// ---------------------------------------------------------------------------

/**
 * Fetches season/episode counts for a TV series.
 *
 * @param {import('./client').MovieBoxClient} client
 * @param {string}  subjectId
 * @returns {Promise<any>}
 */
async function getSeasonDetails(client, subjectId) {
  return client.getFromApi(SEASON_INFO_PATH, { subjectId });
}

// ---------------------------------------------------------------------------
// Resources  (mirrors core.DownloadableVideoFilesDetail)
// ---------------------------------------------------------------------------

/**
 * Fetches the list of downloadable/streamable video files for a subject.
 *
 * @param {import('./client').MovieBoxClient} client
 * @param {string}  subjectId
 * @param {number}  [se=0]          Season number (0 for movies).
 * @param {number}  [ep=0]          Episode number (0 for movies).
 * @param {number}  [resolution=0]  0 = unspecified (server returns all available).
 * @param {number}  [page=1]
 * @param {number}  [perPage]
 * @returns {Promise<any>}
 */
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

// ---------------------------------------------------------------------------
// Play-info / adaptive streaming  (PLAY_INFO_PATH)
// ---------------------------------------------------------------------------

/**
 * Fetches the MPEG-DASH manifest (MPD) URL for a subject.
 *
 * This is the adaptive-bitrate streaming endpoint — different from the
 * `resource` endpoint which returns paginated lists of direct file URLs.
 * Use this when integrating a DASH-capable player (dash.js, Shaka, ExoPlayer).
 *
 * @param {import('./client').MovieBoxClient} client
 * @param {string} subjectId
 * @param {number} [se=0]  Season (0 for movies)
 * @param {number} [ep=0]  Episode (0 for movies)
 * @returns {Promise<any>}
 */
async function getPlayInfo(client, subjectId, se = 0, ep = 0) {
  return client.getFromApi(PLAY_INFO_PATH, { subjectId, se, ep });
}

// ---------------------------------------------------------------------------
// Search v1  (mirrors core.Search – uses SEARCH_PATH, not SEARCH_PATH_V2)
// ---------------------------------------------------------------------------

/**
 * Searches using the original v1 search endpoint.
 * Unlike searchV2, the response has `items` directly at the top level
 * (no `results` wrapper) and includes `verticalRanks` and `counts`.
 *
 * @param {import('./client').MovieBoxClient} client
 * @param {string}  query
 * @param {number}  [subjectType]  SubjectType.*  (default ALL = 0)
 * @param {number}  [page]
 * @param {number}  [perPage]
 * @returns {Promise<any>}
 */
async function searchV1(
  client,
  query,
  subjectType = SubjectType.ALL,
  page = 1,
  perPage = RESULTS_PER_PAGE,
) {
  const payload = { keyword: query, page, perPage, subjectType };
  return client.postToApi(SEARCH_PATH, payload);
}

// ---------------------------------------------------------------------------
// External captions  (mirrors core.DownloadableCaptionFileDetails)
// ---------------------------------------------------------------------------

/**
 * Fetches external subtitle/caption files for a specific video resource.
 *
 * The resourceId comes from the `resourceId` field of a VideoFileMetadata
 * object returned by getResources().
 *
 * @param {import('./client').MovieBoxClient} client
 * @param {string} subjectId
 * @param {string} resourceId
 * @returns {Promise<any>}  Object with `extCaptions` array and `subjectId`.
 */
async function getCaptions(client, subjectId, resourceId) {
  return client.getFromApi(EXT_CAPTIONS_PATH, { subjectId, resourceId });
}

// ---------------------------------------------------------------------------
// Dub helpers
// ---------------------------------------------------------------------------

/**
 * Normalises a raw dub language name the same way the Python validator does:
 *   - Any name starting with "original" (case-insensitive) → "Original"
 *   - Otherwise: strip the word "dub" (case-insensitive) and trim whitespace
 *
 * @param {string} name
 * @returns {string}
 */
function normalizeDubName(name) {
  if (!name) return name;
  if (name.toLowerCase().startsWith("original")) return "Original";
  return name.replace(/dub/gi, "").trim();
}

/**
 * Finds a dub from the `dubs` array by language name or language code.
 * Matching is case-insensitive on the code; exact (after normalisation) on the name.
 *
 * @param {any[]}  dubs              The `dubs` array from getItemDetails().
 * @param {string} langNameOrCode    e.g. "English", "Hindi", "en", "hi".
 * @returns {any | null}             The matching dub object, or null.
 */
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

// ---------------------------------------------------------------------------
// Slug → subjectId resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a detailPath slug (e.g. "heads-of-state-q5uDCmEaIY3") to its
 * numeric subjectId by searching the API and matching on detailUrl.
 *
 * Strategy:
 *  1. Strip the trailing random-looking ID segment from the slug to build a
 *     human-readable search query.
 *  2. Run SearchV2 and scan results for a subject whose detailUrl ends with
 *     the slug.
 *  3. Fall back to a normalised title comparison if no URL match is found.
 *
 * @param {import('./client').MovieBoxClient} client
 * @param {string} slug
 * @returns {Promise<string>}  The subjectId string.
 */
async function resolveSlug(client, slug) {
  const parts = slug.split("-");
  const lastSeg = parts[parts.length - 1];

  // The trailing segment is a random base62-ish ID of 8–14 chars.
  const queryParts = /^[A-Za-z0-9]{8,14}$/.test(lastSeg)
    ? parts.slice(0, -1)
    : parts;
  const query = queryParts.join(" ");

  const data = await searchV2(client, query, SubjectType.ALL, "All", 1, 20);
  const results = data.results ?? [];

  // Collect all subjects across all result groups
  const subjects = [];
  for (const group of results) {
    if (Array.isArray(group.subjects)) subjects.push(...group.subjects);
  }

  // 1) Match by detailUrl's last path segment
  for (const subject of subjects) {
    if (subject.detailUrl) {
      const urlSlug = subject.detailUrl.split("/").pop();
      if (urlSlug === slug) return subject.subjectId;
    }
  }

  // 2) Match by normalised title  (best-effort fallback)
  const querySlug = queryParts.join("-").toLowerCase();
  for (const subject of subjects) {
    const titleSlug = (subject.title ?? "")
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    if (titleSlug === querySlug) return subject.subjectId;
  }

  throw new Error(
    `Could not resolve slug '${slug}' to a subject ID. ` +
      `Try passing ?id=<subjectId> directly to bypass slug resolution.`,
  );
}

// ---------------------------------------------------------------------------

module.exports = {
  getHomepage,
  searchV1,
  searchV2,
  getItemDetails,
  getSeasonDetails,
  getResources,
  getPlayInfo,
  getCaptions,
  normalizeDubName,
  findDub,
  resolveSlug,
};
