"use strict";

/**
 * server.js
 * Express HTTP server exposing the full v3 API surface described in the README.
 *
 * Endpoints
 * ---------
 * Home       GET /home  /home/sections  /home/banner  /home/trending
 *                       /home/hot  /home/cinema  /home/section/:name
 * Movies     GET /movies  /movies/sections  /movies/section/:name
 * TV Series  GET /tv-series  /tv-series/sections  /tv-series/section/:name
 * Animation  GET /animation  /animation/sections  /animation/section/:name
 * Ranking    GET /ranking  /ranking/sections  /ranking/section/:name
 * Search     GET /search?q=  /search/suggest?q=
 * Detail     GET /detail/:slug  /episodes/:slug
 * Stream     GET /api/stream/:subject_id  /watch/:subject_id
 */

const express = require("express");
const { Readable } = require("stream");

const { MovieBoxClient } = require("./client");
const {
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
} = require("./core");
const {
  TAB_IDS,
  SubjectType,
  SERVER_PORT,
  DOWNLOAD_REQUEST_HEADERS,
  VALID_SUBJECT_ID,
} = require("./constants");

// ---------------------------------------------------------------------------
// App + shared client
// ---------------------------------------------------------------------------

const app = express();
const client = new MovieBoxClient();

app.use(express.json());

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function ok(res, data) {
  res.json({ ok: true, data });
}

function fail(res, err, status = 500) {
  const message = err instanceof Error ? err.message : String(err);
  res.status(status).json({ ok: false, error: message });
}

// ---------------------------------------------------------------------------
// Section helpers
// ---------------------------------------------------------------------------

/**
 * Normalises the raw `items` array from getHomepage() into a predictable
 * array of section objects.
 *
 * @param {any} homepageData  Raw data object returned by getHomepage().
 * @returns {Array<{name:string, type:string, position:number, items:any[], banner:any, rankings:any[]}>}
 */
function normalizeSections(homepageData) {
  return (homepageData.items || []).map((item) => ({
    name: item.title || "",
    type: item.type || "",
    position: item.position ?? 0,
    items: item.subjects || [],
    banner: item.banner || null,
    rankings: item.rankings || [],
  }));
}

/**
 * Case-insensitive lookup of a section by its exact title.
 * @param {ReturnType<typeof normalizeSections>} sections
 * @param {string} name
 */
function findSection(sections, name) {
  const target = name.toLowerCase();
  return sections.find((s) => s.name.toLowerCase() === target) || null;
}

// ---------------------------------------------------------------------------
// Route factories  (reused by home / movies / tv-series / animation / ranking)
// ---------------------------------------------------------------------------

/**
 * Returns all homepage data for the given tabId.
 */
function makeFullRoute(tabId) {
  return async (req, res) => {
    try {
      const data = await getHomepage(client, tabId);
      ok(res, data);
    } catch (err) {
      fail(res, err);
    }
  };
}

/**
 * Returns a list of section names and item counts.
 */
function makeSectionsRoute(tabId) {
  return async (req, res) => {
    try {
      const data = await getHomepage(client, tabId);
      const sections = normalizeSections(data);
      ok(
        res,
        sections.map((s) => ({
          name: s.name,
          type: s.type,
          count: s.items.length,
        })),
      );
    } catch (err) {
      fail(res, err);
    }
  };
}

/**
 * Returns one named section.
 */
function makeSectionByNameRoute(tabId) {
  return async (req, res) => {
    const { name } = req.params;
    try {
      const data = await getHomepage(client, tabId);
      const section = findSection(normalizeSections(data), name);
      if (!section) {
        return res
          .status(404)
          .json({ ok: false, error: `Section '${name}' not found` });
      }
      ok(res, section);
    } catch (err) {
      fail(res, err);
    }
  };
}

// ---------------------------------------------------------------------------
// Helper: resolve a slug to subjectId (accepts optional ?id= override)
// ---------------------------------------------------------------------------

async function requireSubjectId(req) {
  const explicit = (req.query.id || "").trim();
  if (explicit) return explicit;
  return resolveSlug(client, req.params.slug);
}

// ---------------------------------------------------------------------------
// Helper: pick the best matching video file from a resource list
// ---------------------------------------------------------------------------

/**
 * @param {any[]} list
 * @param {number} resolution  0 = highest available
 * @returns {any}
 */
function pickVideoFile(list, resolution) {
  if (!list || list.length === 0) throw new Error("No stream files available");

  // resolution 0 → best (highest)
  if (resolution === 0) {
    return list.reduce((best, cur) =>
      cur.resolution > best.resolution ? cur : best,
    );
  }

  // exact match
  const exact = list.find((f) => f.resolution === resolution);
  if (exact) return exact;

  // closest resolution ≤ requested
  const below = list.filter((f) => f.resolution <= resolution);
  if (below.length > 0) {
    return below.reduce((best, cur) =>
      cur.resolution > best.resolution ? cur : best,
    );
  }

  // fallback: lowest available
  return list.reduce((min, cur) =>
    cur.resolution < min.resolution ? cur : min,
  );
}

// ==========================================================================
// Routes
// ==========================================================================

// --------------------------------------------------------------------------
// 🏠 Home
// --------------------------------------------------------------------------

app.get("/home", makeFullRoute(TAB_IDS.HOME));
app.get("/home/sections", makeSectionsRoute(TAB_IDS.HOME));
app.get("/home/section/:name", makeSectionByNameRoute(TAB_IDS.HOME));

app.get("/home/banner", async (req, res) => {
  try {
    const data = await getHomepage(client, TAB_IDS.HOME);
    const sections = normalizeSections(data).filter((s) => s.type === "BANNER");
    ok(res, sections);
  } catch (err) {
    fail(res, err);
  }
});

app.get("/home/trending", async (req, res) => {
  try {
    const data = await getHomepage(client, TAB_IDS.HOME);
    const sections = normalizeSections(data).filter((s) =>
      s.name.toLowerCase().includes("trending"),
    );
    ok(res, sections);
  } catch (err) {
    fail(res, err);
  }
});

app.get("/home/hot", async (req, res) => {
  try {
    const data = await getHomepage(client, TAB_IDS.HOME);
    const sections = normalizeSections(data).filter((s) =>
      s.name.toLowerCase().includes("hot"),
    );
    ok(res, sections);
  } catch (err) {
    fail(res, err);
  }
});

app.get("/home/cinema", async (req, res) => {
  try {
    const data = await getHomepage(client, TAB_IDS.HOME);
    const sections = normalizeSections(data).filter((s) =>
      s.name.toLowerCase().includes("cinema"),
    );
    ok(res, sections);
  } catch (err) {
    fail(res, err);
  }
});

// --------------------------------------------------------------------------
// 🎬 Movies
// --------------------------------------------------------------------------

app.get("/movies", makeFullRoute(TAB_IDS.MOVIE));
app.get("/movies/sections", makeSectionsRoute(TAB_IDS.MOVIE));
app.get("/movies/section/:name", makeSectionByNameRoute(TAB_IDS.MOVIE));

// --------------------------------------------------------------------------
// 📺 TV Series
// --------------------------------------------------------------------------

app.get("/tv-series", makeFullRoute(TAB_IDS.TV_SERIES));
app.get("/tv-series/sections", makeSectionsRoute(TAB_IDS.TV_SERIES));
app.get("/tv-series/section/:name", makeSectionByNameRoute(TAB_IDS.TV_SERIES));

// --------------------------------------------------------------------------
// 🎭 Animation
// --------------------------------------------------------------------------

app.get("/animation", makeFullRoute(TAB_IDS.ANIMATION));
app.get("/animation/sections", makeSectionsRoute(TAB_IDS.ANIMATION));
app.get("/animation/section/:name", makeSectionByNameRoute(TAB_IDS.ANIMATION));

// --------------------------------------------------------------------------
// 🏆 Ranking
// --------------------------------------------------------------------------

app.get("/ranking", makeFullRoute(TAB_IDS.RANKING));
app.get("/ranking/sections", makeSectionsRoute(TAB_IDS.RANKING));
app.get("/ranking/section/:name", makeSectionByNameRoute(TAB_IDS.RANKING));

// --------------------------------------------------------------------------
// 🎬 Play-info  (adaptive / MPEG-DASH streaming)
// --------------------------------------------------------------------------

/**
 * GET /play-info/:subject_id
 * Returns the MPEG-DASH manifest (MPD) URL and associated metadata for
 * adaptive-bitrate streaming.
 *
 * This is a DIFFERENT endpoint from /api/stream — use it when integrating
 * a DASH-capable player such as dash.js, Shaka Player, or ExoPlayer.
 * The /api/stream endpoint returns paginated direct-file (MP4/MKV) URLs.
 *
 * Query params:
 *   se  – season  (default 0, omit for movies)
 *   ep  – episode (default 0, omit for movies)
 *   dub – language name or code for dubbed versions (same as /api/stream)
 */
app.get("/play-info/:subject_id", async (req, res) => {
  const { subject_id } = req.params;
  if (!VALID_SUBJECT_ID.test(subject_id)) {
    return res
      .status(400)
      .json({ ok: false, error: "Invalid subject_id format" });
  }

  const se = parseInt(req.query.se || "0", 10);
  const ep = parseInt(req.query.ep || "0", 10);

  try {
    // Dub resolution — same pattern as /api/stream
    let effectiveId = subject_id;
    let dubInfo = null;
    if (req.query.dub) {
      const details = await getItemDetails(client, subject_id);
      const dub = findDub(details.dubs || [], req.query.dub);
      if (!dub) {
        const available = (details.dubs || []).map(
          (d) => `${normalizeDubName(d.lanName)} (${d.lanCode})`,
        );
        return res.status(404).json({
          ok: false,
          error: `Dub '${req.query.dub}' not found. Available: ${available.join(", ") || "none"}`,
        });
      }
      effectiveId = dub.subjectId;
      dubInfo = {
        lanName: normalizeDubName(dub.lanName),
        lanCode: dub.lanCode,
      };
    }

    const data = await getPlayInfo(client, effectiveId, se, ep);
    ok(res, {
      subject_id,
      effective_subject_id: effectiveId,
      dub: dubInfo,
      ...data,
    });
  } catch (err) {
    fail(res, err);
  }
});

// --------------------------------------------------------------------------
// 🎚️ Resolutions  (quality picker)
// --------------------------------------------------------------------------

/**
 * GET /resolutions/:subject_id
 * Returns the available stream qualities for a subject.
 *
 * Source: `collectionResolutions` from the resource endpoint — this gives
 * the full quality matrix for the entire collection (all seasons/episodes),
 * including per-quality episode counts and average file sizes.
 *
 * Response per quality entry:
 *   resolution        – integer quality (360, 480, 720, 1080)
 *   label             – human-readable label ("360p", "480p", …)
 *   averageSize       – human-readable average file size string
 *   episodeCount      – number of episodes available at this quality
 *   requireMemberType – 0 = free; >0 = premium membership required
 *   memberIcon        – badge string for the required tier (e.g. "VIP")
 */
app.get("/resolutions/:subject_id", async (req, res) => {
  const { subject_id } = req.params;
  if (!VALID_SUBJECT_ID.test(subject_id)) {
    return res
      .status(400)
      .json({ ok: false, error: "Invalid subject_id format" });
  }
  try {
    // Fetch with resolution=0 (all) so collectionResolutions is fully populated
    const data = await getResources(client, subject_id, 0, 0, 0);
    const qualities = (data.collectionResolutions || []).map((r) => ({
      resolution: r.resolution,
      label: `${r.resolution}p`,
      averageSize: r.averageSize,
      episodeCount: r.epNum,
      requireMemberType: r.requireMemberType,
      memberIcon: r.memberIcon,
    }));
    ok(res, { subject_id, qualities });
  } catch (err) {
    fail(res, err);
  }
});

// --------------------------------------------------------------------------
// 🎙️  Dubs  (audio tracks)
// --------------------------------------------------------------------------

/**
 * GET /dubs/:subject_id
 * Lists every available audio track (dub) for a title.
 *
 * Each dub is actually a separate subject in the API – its `subjectId` field
 * is the ID you pass to /api/stream or /watch via the ?dub= parameter.
 *
 * Response shape per dub:
 *   subjectId  – the dubbed version's own subject ID
 *   lanName    – normalised language name ("Original", "Hindi", "Spanish", …)
 *   lanCode    – BCP-47-ish code  ("en", "hi", …)
 *   original   – true if this is the source-language version
 */
app.get("/dubs/:subject_id", async (req, res) => {
  const { subject_id } = req.params;
  if (!VALID_SUBJECT_ID.test(subject_id)) {
    return res
      .status(400)
      .json({ ok: false, error: "Invalid subject_id format" });
  }
  try {
    const details = await getItemDetails(client, subject_id);
    const dubs = (details.dubs || []).map((d) => ({
      subjectId: d.subjectId,
      lanName: normalizeDubName(d.lanName),
      lanCode: d.lanCode,
      original: d.original,
    }));
    ok(res, { subject_id, dubs });
  } catch (err) {
    fail(res, err);
  }
});

// --------------------------------------------------------------------------
// 📝  Subtitles
// --------------------------------------------------------------------------

/**
 * GET /subtitles/proxy?url=<encoded-subtitle-url>
 * Fetches a subtitle file from the CDN and streams it back.
 * Useful for bypassing CORS restrictions in browser-based players.
 *
 * The subtitle CDN (cacdn.hakunaymatata.com) uses signed CloudFront URLs
 * that carry their own auth – do NOT forward any cookies.
 *
 * NOTE: this route MUST be defined before /subtitles/:subject_id so that
 * Express matches the literal "proxy" path first.
 */
app.get("/subtitles/proxy", async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res
      .status(400)
      .json({ ok: false, error: "Missing query param: url" });
  }
  // Basic safety check: only allow the known subtitle CDN
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ ok: false, error: "Invalid url" });
  }
  if (!parsed.hostname.endsWith("hakunaymatata.com")) {
    return res
      .status(403)
      .json({ ok: false, error: "URL not from an allowed subtitle CDN" });
  }
  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": DOWNLOAD_REQUEST_HEADERS["User-Agent"] },
    });
    res.status(upstream.status);
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);
    res.setHeader("access-control-allow-origin", "*");
    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    fail(res, err);
  }
});

/**
 * GET /subtitles/:subject_id
 * Returns the list of subtitle language names that are known to exist for
 * this title (taken from the `subtitles` field in item details – no extra
 * API call needed).  Use this to show the user a language picker.
 *
 * To get the actual downloadable file URLs, call:
 *   GET /subtitles/:subject_id/:resource_id
 * where resource_id comes from the `resourceId` field in /api/stream output.
 */
app.get("/subtitles/:subject_id", async (req, res) => {
  const { subject_id } = req.params;
  if (!VALID_SUBJECT_ID.test(subject_id)) {
    return res
      .status(400)
      .json({ ok: false, error: "Invalid subject_id format" });
  }
  try {
    const details = await getItemDetails(client, subject_id);
    // `subtitles` is a comma-separated string in the raw response
    const raw = details.subtitles || [];
    const languages = Array.isArray(raw)
      ? raw
      : raw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
    ok(res, { subject_id, subtitle_languages: languages });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * GET /subtitles/:subject_id/:resource_id
 * Returns the actual subtitle file URLs for a specific video resource.
 *
 * `resource_id` is the `resourceId` value from any stream entry returned by
 * GET /api/stream/:subject_id.
 *
 * Each caption entry in the response has:
 *   id       – internal subtitle ID
 *   lan      – language code  ("en", "fr", …)
 *   lanName  – human-readable language name  ("English", "Français", …)
 *   url      – CloudFront-signed download URL (ready to use; no extra auth)
 *   size     – file size in bytes
 *   delay    – timing offset in ms
 */
app.get("/subtitles/:subject_id/:resource_id", async (req, res) => {
  const { subject_id, resource_id } = req.params;
  if (!VALID_SUBJECT_ID.test(subject_id)) {
    return res
      .status(400)
      .json({ ok: false, error: "Invalid subject_id format" });
  }
  try {
    const data = await getCaptions(client, subject_id, resource_id);
    const captions = (data.extCaptions || []).map((c) => ({
      id: c.id,
      lan: c.lan,
      lanName: c.lanName,
      url: c.url,
      size: c.size,
      delay: c.delay,
    }));
    ok(res, { subject_id, resource_id, captions });
  } catch (err) {
    fail(res, err);
  }
});

// --------------------------------------------------------------------------
// 🔍 Search
// --------------------------------------------------------------------------

app.get("/search", async (req, res) => {
  const { q, page = "1", per_page = "20", version = "2" } = req.query;
  if (!q)
    return res.status(400).json({ ok: false, error: "Missing query param: q" });

  const pg = parseInt(page, 10);
  const perPage = Math.min(parseInt(per_page, 10), 20);

  try {
    let data;
    if (version === "1") {
      // v1 search: simpler payload, `items` at top level, includes `counts`
      data = await searchV1(client, q, SubjectType.ALL, pg, perPage);
    } else {
      // v2 search (default): richer response with `results` groups + `verticalRanks`
      data = await searchV2(client, q, SubjectType.ALL, "All", pg, perPage);
    }
    ok(res, data);
  } catch (err) {
    fail(res, err);
  }
});

app.get("/search/suggest", async (req, res) => {
  const { q } = req.query;
  if (!q)
    return res.status(400).json({ ok: false, error: "Missing query param: q" });

  try {
    const data = await searchV2(client, q, SubjectType.ALL, "All", 1, 8);
    const suggestions = data.items.map((s) => ({
      title: s.title,
      subjectId: s.subjectId,
      subjectType: s.subjectType,
      releaseDate: s.releaseDate,
      coverUrl: s.cover?.url ?? null,
      detailUrl: s.detailUrl ?? null,
    }));
    ok(res, suggestions);
  } catch (err) {
    fail(res, err);
  }
});

// --------------------------------------------------------------------------
// 📄 Detail  /detail/:slug  and  /episodes/:slug
//
// The slug is the detailPath (e.g. "heads-of-state-q5uDCmEaIY3").
// Pass ?id=<subjectId> to skip slug resolution.
// --------------------------------------------------------------------------

app.get("/detail/:slug", async (req, res) => {
  try {
    const subjectId = await requireSubjectId(req);
    const details = await getItemDetails(client, subjectId);

    // Attach season info for TV series
    if (details.subjectType === SubjectType.TV_SERIES) {
      try {
        details.seasons = await getSeasonDetails(client, subjectId);
      } catch {
        /* non-fatal — series might not have season data */
      }
    }

    // Attach stream links  (se=0, ep=0 fetches all available files for movies;
    // for series it returns whatever the API provides without an episode filter)
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

    ok(res, details);
  } catch (err) {
    fail(res, err);
  }
});

app.get("/episodes/:slug", async (req, res) => {
  try {
    const subjectId = await requireSubjectId(req);
    const seasons = await getSeasonDetails(client, subjectId);
    ok(res, seasons);
  } catch (err) {
    fail(res, err);
  }
});

// --------------------------------------------------------------------------
// ▶️  Streaming
// --------------------------------------------------------------------------

/**
 * GET /api/stream/:subject_id
 * Returns a JSON object listing all available stream URLs + metadata.
 *
 * Query params:
 *   detail_path  (ignored – kept for API compat)
 *   se           season  (default 0)
 *   ep           episode (default 0)
 *   resolution   480 | 720 | 1080 | 0 for highest (default 0)
 */
app.get("/api/stream/:subject_id", async (req, res) => {
  const { subject_id } = req.params;
  if (!VALID_SUBJECT_ID.test(subject_id)) {
    return res
      .status(400)
      .json({ ok: false, error: "Invalid subject_id format" });
  }

  const se = parseInt(req.query.se || "0", 10);
  const ep = parseInt(req.query.ep || "0", 10);
  const resolution = parseInt(req.query.resolution || "0", 10);

  try {
    // --- Dub resolution ---
    // If ?dub= is provided, look up the dub and swap in its subjectId.
    let effectiveId = subject_id;
    let dubInfo = null;
    if (req.query.dub) {
      const details = await getItemDetails(client, subject_id);
      const dub = findDub(details.dubs || [], req.query.dub);
      if (!dub) {
        const available = (details.dubs || []).map(
          (d) => `${normalizeDubName(d.lanName)} (${d.lanCode})`,
        );
        return res.status(404).json({
          ok: false,
          error: `Dub '${req.query.dub}' not found. Available: ${available.join(", ") || "none"}`,
        });
      }
      effectiveId = dub.subjectId;
      dubInfo = {
        lanName: normalizeDubName(dub.lanName),
        lanCode: dub.lanCode,
      };
    }

    const data = await getResources(client, effectiveId, se, ep, 0);
    const list = data.list || [];

    if (list.length === 0) {
      return res
        .status(404)
        .json({ ok: false, error: "No streams found for this subject" });
    }

    // Filter by se/ep when non-zero
    const filtered =
      se || ep
        ? list.filter(
            (f) => (se ? f.se === se : true) && (ep ? f.ep === ep : true),
          )
        : list;

    // Sort by resolution descending and optionally narrow to requested quality
    const sorted = [...filtered].sort((a, b) => b.resolution - a.resolution);
    const streams = resolution ? [pickVideoFile(filtered, resolution)] : sorted;

    ok(res, {
      subject_id,
      effective_subject_id: effectiveId,
      dub: dubInfo,
      subject_type: data.subjectType,
      title: data.subjectTitle,
      streams: streams.map((f) => ({
        url: f.resourceLink,
        sourceUrl: f.sourceUrl, // pre-CDN-redirect URL
        resourceId: f.resourceId, // key for /subtitles/:id/:resourceId
        linkType: f.linkType, // 0=unknown 1=MP4 2=HLS 3=DASH (interpret per player)
        resolution: f.resolution,
        season: f.se,
        episode: f.ep,
        size: f.size,
        duration: f.duration,
        codec: f.codecName,
        requireMemberType: f.requireMemberType, // 0=free, >0=premium tier required
        memberIcon: f.memberIcon, // e.g. "VIP"
        embeddedSubtitles: f.extCaptions || [], // subtitles already bundled in this file
      })),
    });
  } catch (err) {
    fail(res, err);
  }
});

/**
 * GET /watch/:subject_id
 * Zero-buffer video proxy – streams the content directly to the client.
 *
 * Forwards Range headers so video seeking works out of the box.
 *
 * Query params:
 *   detail_path  (ignored – kept for API compat)
 *   se           season  (default 0)
 *   ep           episode (default 0)
 *   resolution   480 | 720 | 1080 | 0 for highest (default 0)
 */
app.get("/watch/:subject_id", async (req, res) => {
  const { subject_id } = req.params;
  if (!VALID_SUBJECT_ID.test(subject_id)) {
    return res
      .status(400)
      .json({ ok: false, error: "Invalid subject_id format" });
  }

  const se = parseInt(req.query.se || "0", 10);
  const ep = parseInt(req.query.ep || "0", 10);
  const resolution = parseInt(req.query.resolution || "0", 10);

  try {
    // --- Dub resolution ---
    let effectiveId = subject_id;
    if (req.query.dub) {
      const details = await getItemDetails(client, subject_id);
      const dub = findDub(details.dubs || [], req.query.dub);
      if (!dub) {
        const available = (details.dubs || []).map(
          (d) => `${normalizeDubName(d.lanName)} (${d.lanCode})`,
        );
        return res.status(404).json({
          ok: false,
          error: `Dub '${req.query.dub}' not found. Available: ${available.join(", ") || "none"}`,
        });
      }
      effectiveId = dub.subjectId;
    }

    // Resolve the video URL
    const data = await getResources(client, effectiveId, se, ep, 0);
    const list = data.list || [];

    const episodeFiles =
      se || ep
        ? list.filter(
            (f) => (se ? f.se === se : true) && (ep ? f.ep === ep : true),
          )
        : list;

    const mediaFile = pickVideoFile(episodeFiles, resolution);
    const videoUrl = mediaFile.resourceLink;

    // Build upstream request headers
    const proxyHeaders = { ...DOWNLOAD_REQUEST_HEADERS };
    if (req.headers["range"]) proxyHeaders["Range"] = req.headers["range"];
    if (req.headers["if-range"])
      proxyHeaders["If-Range"] = req.headers["if-range"];
    if (req.headers["if-modified-since"])
      proxyHeaders["If-Modified-Since"] = req.headers["if-modified-since"];

    const upstream = await client.getRawStream(videoUrl, proxyHeaders);

    // Forward status + relevant headers to the client
    res.status(upstream.status);
    const FORWARD = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "last-modified",
      "etag",
    ];
    for (const header of FORWARD) {
      const val = upstream.headers.get(header);
      if (val) res.setHeader(header, val);
    }

    // Pipe body without buffering (zero-buffer proxy)
    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) fail(res, err);
  }
});

// --------------------------------------------------------------------------
// 404 catch-all
// --------------------------------------------------------------------------

app.use((req, res) => {
  res
    .status(404)
    .json({ ok: false, error: `Unknown route: ${req.method} ${req.path}` });
});

// --------------------------------------------------------------------------
// Start (only when run directly: `node src/server.js`)
// --------------------------------------------------------------------------

if (require.main === module) {
  app.listen(SERVER_PORT, () => {
    console.log(
      `MovieBox API server running → http://localhost:${SERVER_PORT}`,
    );
    console.log("Available routes:");
    const routeTable = [
      ["🏠 Home", "GET /home", "GET /home/sections", "GET /home/section/:name", "GET /home/banner", "GET /home/trending", "GET /home/hot", "GET /home/cinema"],
      ["🎬 Movies", "GET /movies", "GET /movies/sections", "GET /movies/section/:name"],
      ["📺 TV Series", "GET /tv-series", "GET /tv-series/sections", "GET /tv-series/section/:name"],
      ["🎭 Animation", "GET /animation", "GET /animation/sections", "GET /animation/section/:name"],
      ["🏆 Ranking", "GET /ranking", "GET /ranking/sections", "GET /ranking/section/:name"],
      ["🔍 Search", "GET /search?q=", "GET /search/suggest?q="],
      ["📄 Detail", "GET /detail/:slug", "GET /episodes/:slug"],
      ["🎞️ Stream", "GET /api/stream/:subject_id", "GET /watch/:subject_id"],
      ["🎬 Play Info", "GET /play-info/:subject_id"],
      ["🎚️ Resolutions", "GET /resolutions/:subject_id"],
      ["🎙️ Dubs", "GET /dubs/:subject_id"],
      ["📝 Subtitles", "GET /subtitles/:subject_id", "GET /subtitles/:subject_id/:resource_id", "GET /subtitles/proxy"],
    ];
    for (const [group, ...routes] of routeTable) {
      console.log(`  ${group}`);
      for (const route of routes) {
        console.log(`    ${route}`);
      }
    }
  });
}

module.exports = app;

// GET /home
// GET /home/sections
// GET /home/section/:name
// GET /home/banner
// GET /home/trending
// GET /home/hot
// GET /home/cinema
// GET /movies
// GET /movies/sections
// GET /movies/section/:name
// GET /tv-series
// GET /tv-series/sections
// GET /tv-series/section/:name
// GET /animation
// GET /animation/sections
// GET /animation/section/:name
// GET /ranking
// GET /ranking/sections
// GET /ranking/section/:name
// GET /play-info/:subject_id
// GET /resolutions/:subject_id
// GET /dubs/:subject_id
// GET /subtitles/:subject_id
// GET /subtitles/:subject_id/:resource_id
// GET /subtitles/proxy
// GET /search
// GET /search/suggest
// GET /detail/:slug
// GET /episodes/:slug
// GET /api/stream/:subject_id
// GET /watch/:subject_id
