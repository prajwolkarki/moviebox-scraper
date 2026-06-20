# MovieBox API Server (JS port of v3)

A Node.js/Express HTTP server that exposes the MovieBox Android backend
(`api3–api6.aoneroom.com`) as a clean REST API.

## Requirements

- **Node.js ≥ 18** (uses the built-in `fetch` and `crypto` globals)
- npm or any compatible package manager

## Setup

```bash
cd server
npm install
cp .env.example .env   # edit if needed
npm start
```

The server starts on **http://localhost:3000** by default (`PORT` env var).

---

## API Endpoints

### 🏠 Home

| Method | Path | Description |
|--------|------|-------------|
| GET | `/home` | Full homepage data including banners and all sections |
| GET | `/home/sections` | List all section names and item counts |
| GET | `/home/banner` | Featured banner sections |
| GET | `/home/trending` | Sections whose title contains "trending" |
| GET | `/home/hot` | Sections whose title contains "hot" |
| GET | `/home/cinema` | Sections whose title contains "cinema" |
| GET | `/home/section/:name` | A specific section by exact (case-insensitive) name |

### 🎬 Movies / TV / Animation

Each category exposes the same three sub-routes, driven by a different `tabId`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/movies` | All movie sections |
| GET | `/movies/sections` | List movie section names |
| GET | `/movies/section/:name` | A specific movie section |
| GET | `/tv-series` | All TV-series sections |
| GET | `/tv-series/sections` | List TV section names |
| GET | `/tv-series/section/:name` | A specific TV section |
| GET | `/animation` | All animation sections |
| GET | `/animation/sections` | List animation section names |
| GET | `/animation/section/:name` | A specific animation section |

### 🏆 Ranking

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ranking` | All ranking sections |
| GET | `/ranking/sections` | List ranking section names |
| GET | `/ranking/section/:name` | A specific ranking section |

### 🔍 Search

| Method | Path | Description |
|--------|------|-------------|
| GET | `/search?q=<query>` | Full search results (paged; add `&page=N&per_page=N`) |
| GET | `/search/suggest?q=<query>` | Lightweight autocomplete suggestions |

### 📄 Details

| Method | Path | Description |
|--------|------|-------------|
| GET | `/detail/:slug` | Full metadata + cast + seasons + stream links |
| GET | `/episodes/:slug` | Season/episode counts only |

`slug` is the `detailPath` field returned by any listing endpoint
(e.g. `heads-of-state-q5uDCmEaIY3`).

**Shortcut**: append `?id=<subjectId>` to skip slug resolution and call the
detail API directly — faster and more reliable for programmatic access.

### ▶️ Streaming

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stream/:subject_id` | JSON list of all available stream URLs |
| GET | `/watch/:subject_id` | Zero-buffer video proxy (pipe directly to a player) |

**Query parameters** for both streaming routes:

| Param | Default | Description |
|-------|---------|-------------|
| `detail_path` | — | The slug (accepted but not required by the Android API) |
| `se` | `0` | Season number |
| `ep` | `0` | Episode number |
| `resolution` | `0` | `480`, `720`, `1080`, or `0` for highest available |

**Example – stream an episode in a player:**
```
/watch/765625015365780944?se=1&ep=3&resolution=1080
```

**Seeking / range requests** are forwarded transparently, so the proxy works
with standard HTML5 `<video>` elements.

---

## All responses

Success:
```json
{ "ok": true, "data": { ... } }
```

Error:
```json
{ "ok": false, "error": "human-readable message" }
```

---

## Architecture

```
src/
  constants.js   – all constants, keys, host pool, SubjectType, tab IDs
  crypto.js      – request-signing (X-Client-Token, x-tr-signature)
  client.js      – HTTP client with host-pool failover + token refresh
  core.js        – thin wrappers over each Android API endpoint
  server.js      – Express routes
```

### Tab IDs

The Android app exposes different content tabs via an integer `tabId` query
parameter. `tabId=0` (the home tab) is confirmed from the Python source.
The others (movies, TV, animation, ranking) are reasonable guesses.

If a category returns unexpected content, adjust the `TAB_MOVIE` / `TAB_TV` /
`TAB_ANIMATION` / `TAB_RANKING` values in `.env` by monitoring the app's
network traffic with a proxy tool (mitmproxy, Charles, etc.).

### Slug resolution

`/detail/:slug` and `/episodes/:slug` work by:

1. Stripping the trailing random-ID segment from the slug to form a title query.
2. Calling the SearchV2 endpoint and scanning results for a `detailUrl` whose
   last path segment matches the slug.
3. Falling back to a normalised-title comparison if no URL match is found.

For the most reliable experience, pass `?id=<subjectId>` directly — the
`subjectId` is returned by every search and listing endpoint.
