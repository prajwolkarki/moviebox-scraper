"use strict";

const request = require("supertest");
const { Readable } = require("stream");

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCore = {
  getHomepage: jest.fn(),
  searchV1: jest.fn(),
  searchV2: jest.fn(),
  getItemDetails: jest.fn(),
  getSeasonDetails: jest.fn(),
  getResources: jest.fn(),
  getPlayInfo: jest.fn(),
  getCaptions: jest.fn(),
  normalizeDubName: jest.fn(),
  findDub: jest.fn(),
  resolveSlug: jest.fn(),
};

jest.mock("../src/core", () => mockCore);

const mockGetRawStream = jest.fn();
jest.mock("../src/client", () => ({
  MovieBoxClient: jest.fn().mockImplementation(() => ({
    getRawStream: mockGetRawStream,
  })),
}));

// Mock global fetch for /subtitles/proxy
const mockFetch = jest.fn();
global.fetch = mockFetch;

const app = require("../src/server");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_SUBJECT_ID = "123456789012345678901";
const VALID_RESOURCE_ID = "res-001";
const MOCK_SLUG = "test-movie-abc12345";

beforeEach(() => {
  jest.clearAllMocks();
});

// Sample homepage data used by /home, /movies, /tv-series, /animation, /ranking
function makeHomepageData(items = []) {
  return { items };
}

function makeSection(name, type = "LIST", subjects = []) {
  return { title: name, type, position: 0, subjects };
}

function makeSubject(id = VALID_SUBJECT_ID, title = "Test Title") {
  return {
    subjectId: id,
    title,
    cover: { url: "https://example.com/cover.jpg" },
    subjectType: 1,
    releaseDate: "2024",
    detailUrl: `/detail/${MOCK_SLUG}`,
  };
}

// ---------------------------------------------------------------------------
// Route table for verification
// ---------------------------------------------------------------------------

const ALL_ROUTES = [
  // Home
  { method: "GET", path: "/home" },
  { method: "GET", path: "/home/sections" },
  { method: "GET", path: "/home/section/Action" },
  { method: "GET", path: "/home/banner" },
  { method: "GET", path: "/home/trending" },
  { method: "GET", path: "/home/hot" },
  { method: "GET", path: "/home/cinema" },
  // Movies
  { method: "GET", path: "/movies" },
  { method: "GET", path: "/movies/sections" },
  { method: "GET", path: "/movies/section/Action" },
  // TV Series
  { method: "GET", path: "/tv-series" },
  { method: "GET", path: "/tv-series/sections" },
  { method: "GET", path: "/tv-series/section/Action" },
  // Animation
  { method: "GET", path: "/animation" },
  { method: "GET", path: "/animation/sections" },
  { method: "GET", path: "/animation/section/Action" },
  // Ranking
  { method: "GET", path: "/ranking" },
  { method: "GET", path: "/ranking/sections" },
  { method: "GET", path: "/ranking/section/Action" },
  // Play info
  { method: "GET", path: `/play-info/${VALID_SUBJECT_ID}` },
  // Resolutions
  { method: "GET", path: `/resolutions/${VALID_SUBJECT_ID}` },
  // Dubs
  { method: "GET", path: `/dubs/${VALID_SUBJECT_ID}` },
  // Subtitles
  { method: "GET", path: `/subtitles/${VALID_SUBJECT_ID}` },
  { method: "GET", path: `/subtitles/${VALID_SUBJECT_ID}/${VALID_RESOURCE_ID}` },
  { method: "GET", path: "/subtitles/proxy?url=https://cdn.hakunaymatata.com/sub.vtt" },
  // Search
  { method: "GET", path: "/search?q=test" },
  { method: "GET", path: "/search/suggest?q=test" },
  // Detail
  { method: "GET", path: `/detail/${MOCK_SLUG}` },
  { method: "GET", path: `/episodes/${MOCK_SLUG}` },
  // Stream
  { method: "GET", path: `/api/stream/${VALID_SUBJECT_ID}` },
  { method: "GET", path: `/watch/${VALID_SUBJECT_ID}` },
];

// ===========================================================================
// Tests
// ===========================================================================

describe("Route availability", () => {
  test.each(ALL_ROUTES)("$method $path returns 200 or 400/404", async ({ method, path }) => {
    // Mock core responses based on route pattern
    if (path.startsWith("/home") || path.startsWith("/movies") || path.startsWith("/tv-series") || path.startsWith("/animation") || path.startsWith("/ranking")) {
      mockCore.getHomepage.mockResolvedValue(makeHomepageData([
        makeSection("Action", "LIST", [makeSubject()]),
        makeSection("Trending Now", "LIST", [makeSubject()]),
        makeSection("Hot Picks", "LIST", [makeSubject()]),
        makeSection("Cinema", "LIST", [makeSubject()]),
        makeSection("Banner", "BANNER", [makeSubject()]),
      ]));
    }

    if (path.includes("/play-info")) {
      mockCore.getItemDetails.mockResolvedValue({ dubs: [] });
      mockCore.getPlayInfo.mockResolvedValue({
        mpdUrl: "https://example.com/manifest.mpd",
        licenseUrl: null,
      });
    }

    if (path.includes("/resolutions")) {
      mockCore.getResources.mockResolvedValue({
        collectionResolutions: [
          { resolution: 360, averageSize: "300 MB", epNum: 1, requireMemberType: 0, memberIcon: "" },
          { resolution: 720, averageSize: "800 MB", epNum: 1, requireMemberType: 0, memberIcon: "" },
        ],
      });
    }

    if (path.includes("/dubs")) {
      mockCore.getItemDetails.mockResolvedValue({
        dubs: [
          { subjectId: VALID_SUBJECT_ID, lanName: "English", lanCode: "en", original: true },
        ],
      });
      mockCore.normalizeDubName.mockImplementation((n) => n);
    }

    if (path.startsWith("/subtitles/") && path.includes("proxy")) {
      mockFetch.mockResolvedValue({
        status: 200,
        headers: { get: () => "text/vtt" },
        body: null,
      });
    } else if (path.startsWith("/subtitles/")) {
      mockCore.getItemDetails.mockResolvedValue({
        subtitles: ["English", "Spanish"],
      });
      mockCore.getCaptions.mockResolvedValue({
        extCaptions: [
          { id: "1", lan: "en", lanName: "English", url: "https://cdn.example.com/sub.vtt", size: 1000, delay: 0 },
        ],
      });
    }

    if (path.includes("/search")) {
      mockCore.searchV2.mockResolvedValue({
        results: [{ subjects: [makeSubject()] }],
        items: [makeSubject()],
        total: 1,
      });
      mockCore.searchV1.mockResolvedValue({
        items: [makeSubject()],
        counts: { movie: 1 },
      });
    }

    if (path.includes("/detail") || path.includes("/episodes")) {
      mockCore.resolveSlug.mockResolvedValue(VALID_SUBJECT_ID);
      mockCore.getItemDetails.mockResolvedValue({
        subjectId: VALID_SUBJECT_ID,
        title: "Test Movie",
        subjectType: 1,
        dubs: [],
        subtitles: [],
      });
      mockCore.getSeasonDetails.mockResolvedValue({
        seasons: [{ season: 1, episodes: 10 }],
      });
      mockCore.getResources.mockResolvedValue({
        list: [
          { resourceLink: "https://example.com/video.mp4", resolution: 1080, se: 1, ep: 1, size: "1 GB", duration: "2h", codecName: "h264", resourceId: VALID_RESOURCE_ID },
        ],
        subjectType: 1,
        subjectTitle: "Test Movie",
      });
    }

    if (path.includes("/api/stream")) {
      mockCore.getItemDetails.mockResolvedValue({ dubs: [] });
      mockCore.getResources.mockResolvedValue({
        list: [
          { resourceLink: "https://example.com/video.mp4", sourceUrl: "https://source.com/video.mp4", resourceId: VALID_RESOURCE_ID, linkType: 1, resolution: 1080, se: 0, ep: 0, size: "1 GB", duration: "2h", codecName: "h264", requireMemberType: 0, memberIcon: "", extCaptions: [] },
        ],
        subjectType: 1,
        subjectTitle: "Test Movie",
      });
    }

    if (path.includes("/watch")) {
      mockCore.getItemDetails.mockResolvedValue({ dubs: [] });
      mockCore.getResources.mockResolvedValue({
        list: [
          { resourceLink: "https://example.com/video.mp4", resourceId: VALID_RESOURCE_ID, linkType: 1, resolution: 1080, se: 0, ep: 0, size: "1 GB", duration: "2h", codecName: "h264", requireMemberType: 0, memberIcon: "", extCaptions: [], sourceUrl: "" },
        ],
        subjectType: 1,
        subjectTitle: "Test Movie",
      });
      mockGetRawStream.mockResolvedValue({
        status: 200,
        headers: { get: () => null },
        body: null,
      });
    }

    const res = await request(app)[method.toLowerCase()](path);

    // Valid responses (200 success, 400 validation, 404 not found)
    expect([200, 400, 404]).toContain(res.status);

    // Format check for JSON responses (proxy routes stream non-JSON)
    if (res.status === 200 && !path.includes("/watch") && !path.includes("/proxy")) {
      expect(res.body).toHaveProperty("ok", true);
      expect(res.body).toHaveProperty("data");
    }
  });
});

// ===========================================================================
// 🏠 Home
// ===========================================================================

describe("GET /home", () => {
  it("returns full homepage data", async () => {
    mockCore.getHomepage.mockResolvedValue(makeHomepageData([
      makeSection("Action"),
      makeSection("Comedy"),
    ]));

    const res = await request(app).get("/home");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(mockCore.getHomepage).toHaveBeenCalled();
  });

  it("returns 500 on API error", async () => {
    mockCore.getHomepage.mockRejectedValue(new Error("API unavailable"));

    const res = await request(app).get("/home");
    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe("API unavailable");
  });
});

describe("GET /home/sections", () => {
  it("returns section names and counts", async () => {
    mockCore.getHomepage.mockResolvedValue(makeHomepageData([
      makeSection("Action", "LIST", [makeSubject(), makeSubject()]),
      makeSection("Comedy", "LIST", [makeSubject()]),
    ]));

    const res = await request(app).get("/home/sections");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { name: "Action", type: "LIST", count: 2 },
      { name: "Comedy", type: "LIST", count: 1 },
    ]);
  });
});

describe("GET /home/section/:name", () => {
  it("returns a specific section by name (case-insensitive)", async () => {
    mockCore.getHomepage.mockResolvedValue(makeHomepageData([
      makeSection("Action", "LIST", [makeSubject()]),
    ]));

    const res = await request(app).get("/home/section/action");
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Action");
  });

  it("returns 404 for unknown section", async () => {
    mockCore.getHomepage.mockResolvedValue(makeHomepageData([
      makeSection("Action"),
    ]));

    const res = await request(app).get("/home/section/Unknown");
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});

describe("GET /home/banner", () => {
  it("returns only BANNER type sections", async () => {
    mockCore.getHomepage.mockResolvedValue(makeHomepageData([
      makeSection("Banner 1", "BANNER", [makeSubject()]),
      makeSection("Action", "LIST", [makeSubject()]),
      makeSection("Banner 2", "BANNER", [makeSubject()]),
    ]));

    const res = await request(app).get("/home/banner");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((s) => s.type === "BANNER")).toBe(true);
  });
});

describe("GET /home/trending", () => {
  it("returns sections with 'trending' in title", async () => {
    mockCore.getHomepage.mockResolvedValue(makeHomepageData([
      makeSection("Trending Now"),
      makeSection("Action"),
      makeSection("Trending Movies"),
    ]));

    const res = await request(app).get("/home/trending");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});

describe("GET /home/hot", () => {
  it("returns sections with 'hot' in title", async () => {
    mockCore.getHomepage.mockResolvedValue(makeHomepageData([
      makeSection("Hot Picks"),
      makeSection("Action"),
      makeSection("Hottest Shows"),
    ]));

    const res = await request(app).get("/home/hot");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});

describe("GET /home/cinema", () => {
  it("returns sections with 'cinema' in title", async () => {
    mockCore.getHomepage.mockResolvedValue(makeHomepageData([
      makeSection("Cinema"),
      makeSection("Action"),
      makeSection("Cinema Classics"),
    ]));

    const res = await request(app).get("/home/cinema");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});

// ===========================================================================
// 🎬 Movies / 📺 TV Series / 🎭 Animation / 🏆 Ranking
// ===========================================================================

describe("Category routes (movies/tv-series/animation/ranking)", () => {
  const categories = [
    { path: "/movies", tabId: 1 },
    { path: "/tv-series", tabId: 2 },
    { path: "/animation", tabId: 3 },
    { path: "/ranking", tabId: 4 },
  ];

  for (const cat of categories) {
    describe(`GET ${cat.path}`, () => {
      it("returns full data", async () => {
        mockCore.getHomepage.mockResolvedValue(makeHomepageData([
          makeSection("Top Picks"),
        ]));

        const res = await request(app).get(cat.path);
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
      });
    });

    describe(`GET ${cat.path}/sections`, () => {
      it("returns section list", async () => {
        mockCore.getHomepage.mockResolvedValue(makeHomepageData([
          makeSection("Top Picks", "LIST", [makeSubject()]),
        ]));

        const res = await request(app).get(`${cat.path}/sections`);
        expect(res.status).toBe(200);
        expect(res.body.data).toBeInstanceOf(Array);
      });
    });

    describe(`GET ${cat.path}/section/:name`, () => {
      it("returns a named section", async () => {
        mockCore.getHomepage.mockResolvedValue(makeHomepageData([
          makeSection("Top Picks", "LIST", [makeSubject()]),
        ]));

        const res = await request(app).get(`${cat.path}/section/Top Picks`);
        expect(res.status).toBe(200);
        expect(res.body.data.name).toBe("Top Picks");
      });

      it("returns 404 for missing section", async () => {
        mockCore.getHomepage.mockResolvedValue(makeHomepageData([]));

        const res = await request(app).get(`${cat.path}/section/Unknown`);
        expect(res.status).toBe(404);
      });
    });
  }
});

// ===========================================================================
// 🎬 Play Info
// ===========================================================================

describe("GET /play-info/:subject_id", () => {
  it("returns MPD manifest URL", async () => {
    mockCore.getItemDetails.mockResolvedValue({ dubs: [] });
    mockCore.getPlayInfo.mockResolvedValue({
      mpdUrl: "https://example.com/manifest.mpd",
      licenseUrl: null,
    });

    const res = await request(app).get(`/play-info/${VALID_SUBJECT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.mpdUrl).toBeDefined();
  });

  it("returns 400 for invalid subject_id", async () => {
    const res = await request(app).get("/play-info/123");
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("returns 404 for unknown dub", async () => {
    mockCore.getItemDetails.mockResolvedValue({
      dubs: [{ subjectId: VALID_SUBJECT_ID, lanName: "English", lanCode: "en" }],
    });
    mockCore.findDub.mockReturnValue(null);
    mockCore.normalizeDubName.mockReturnValue("Spanish");

    const res = await request(app).get(`/play-info/${VALID_SUBJECT_ID}?dub=Spanish`);
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });
});

// ===========================================================================
// 🎚️ Resolutions
// ===========================================================================

describe("GET /resolutions/:subject_id", () => {
  it("returns available qualities", async () => {
    mockCore.getResources.mockResolvedValue({
      collectionResolutions: [
        { resolution: 360, averageSize: "300 MB", epNum: 1, requireMemberType: 0, memberIcon: "" },
        { resolution: 720, averageSize: "800 MB", epNum: 1, requireMemberType: 0, memberIcon: "" },
      ],
    });

    const res = await request(app).get(`/resolutions/${VALID_SUBJECT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.qualities).toHaveLength(2);
    expect(res.body.data.qualities[0].resolution).toBe(360);
  });

  it("returns 400 for invalid subject_id", async () => {
    const res = await request(app).get("/resolutions/abc");
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 🎙️ Dubs
// ===========================================================================

describe("GET /dubs/:subject_id", () => {
  it("returns available dubs", async () => {
    mockCore.getItemDetails.mockResolvedValue({
      dubs: [
        { subjectId: VALID_SUBJECT_ID, lanName: "English", lanCode: "en", original: true },
        { subjectId: "999", lanName: "Hindi", lanCode: "hi", original: false },
      ],
    });
    mockCore.normalizeDubName.mockImplementation((name) => name);

    const res = await request(app).get(`/dubs/${VALID_SUBJECT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.dubs).toHaveLength(2);
  });

  it("returns 400 for invalid subject_id", async () => {
    const res = await request(app).get("/dubs/xyz");
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 📝 Subtitles
// ===========================================================================

describe("GET /subtitles/:subject_id", () => {
  it("returns subtitle languages", async () => {
    mockCore.getItemDetails.mockResolvedValue({
      subtitles: ["English", "Spanish", "French"],
    });

    const res = await request(app).get(`/subtitles/${VALID_SUBJECT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.subtitle_languages).toHaveLength(3);
  });

  it("returns 400 for invalid subject_id", async () => {
    const res = await request(app).get("/subtitles/bad-id");
    expect(res.status).toBe(400);
  });
});

describe("GET /subtitles/:subject_id/:resource_id", () => {
  it("returns caption file URLs", async () => {
    mockCore.getCaptions.mockResolvedValue({
      extCaptions: [
        { id: "1", lan: "en", lanName: "English", url: "https://cdn.example.com/sub.vtt", size: 1000, delay: 0 },
      ],
    });

    const res = await request(app).get(`/subtitles/${VALID_SUBJECT_ID}/${VALID_RESOURCE_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.captions).toHaveLength(1);
    expect(res.body.data.captions[0].lan).toBe("en");
  });

  it("returns 400 for invalid subject_id", async () => {
    const res = await request(app).get("/subtitles/bad-id/res-1");
    expect(res.status).toBe(400);
  });
});

describe("GET /subtitles/proxy", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("proxies subtitle file from CDN", async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      headers: { get: (key) => ({ "content-type": "text/vtt" })[key] || null },
      body: null,
    });

    const res = await request(app).get(
      "/subtitles/proxy?url=https://cdn.hakunaymatata.com/sub.vtt",
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 when url is missing", async () => {
    const res = await request(app).get("/subtitles/proxy");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing");
  });

  it("returns 400 for invalid URL", async () => {
    const res = await request(app).get("/subtitles/proxy?url=not-a-url");
    expect(res.status).toBe(400);
  });

  it("returns 403 for disallowed CDN", async () => {
    const res = await request(app).get(
      "/subtitles/proxy?url=https://evil.com/sub.vtt",
    );
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// 🔍 Search
// ===========================================================================

describe("GET /search", () => {
  it("returns search results (v2 default)", async () => {
    mockCore.searchV2.mockResolvedValue({
      results: [{ subjects: [makeSubject()] }],
      items: [makeSubject()],
      total: 1,
    });

    const res = await request(app).get("/search?q=test");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockCore.searchV2).toHaveBeenCalled();
  });

  it("returns v1 search results when ?version=1", async () => {
    mockCore.searchV1.mockResolvedValue({
      items: [makeSubject()],
      counts: { movie: 1 },
    });

    const res = await request(app).get("/search?q=test&version=1");
    expect(res.status).toBe(200);
    expect(mockCore.searchV1).toHaveBeenCalled();
  });

  it("returns 400 when q is missing", async () => {
    const res = await request(app).get("/search");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing query param");
  });
});

describe("GET /search/suggest", () => {
  it("returns suggestions", async () => {
    mockCore.searchV2.mockResolvedValue({
      items: [
        { title: "Test Movie", subjectId: VALID_SUBJECT_ID, subjectType: 1, releaseDate: "2024", cover: { url: "https://example.com/cover.jpg" }, detailUrl: "/detail/test" },
      ],
    });

    const res = await request(app).get("/search/suggest?q=test");
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe("Test Movie");
  });

  it("returns 400 when q is missing", async () => {
    const res = await request(app).get("/search/suggest");
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 📄 Detail
// ===========================================================================

describe("GET /detail/:slug", () => {
  it("returns full item details with streams", async () => {
    mockCore.resolveSlug.mockResolvedValue(VALID_SUBJECT_ID);
    mockCore.getItemDetails.mockResolvedValue({
      subjectId: VALID_SUBJECT_ID,
      title: "Test Movie",
      subjectType: 1,
      dubs: [],
      subtitles: [],
    });
    mockCore.getResources.mockResolvedValue({
      list: [
        { resourceLink: "https://example.com/video.mp4", resourceId: VALID_RESOURCE_ID, resolution: 1080, se: 0, ep: 0, size: "1 GB", duration: "2h", codecName: "h264" },
      ],
    });

    const res = await request(app).get(`/detail/${MOCK_SLUG}`);
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Test Movie");
    expect(res.body.data.streams).toBeDefined();
  });

  it("supports ?id= to bypass slug resolution", async () => {
    mockCore.getItemDetails.mockResolvedValue({
      subjectId: VALID_SUBJECT_ID,
      title: "Bypass Movie",
      subjectType: 1,
      dubs: [],
      subtitles: [],
    });
    mockCore.getResources.mockResolvedValue({ list: [] });

    const res = await request(app).get(`/detail/some-slug?id=${VALID_SUBJECT_ID}`);
    expect(res.status).toBe(200);
    expect(mockCore.resolveSlug).not.toHaveBeenCalled();
  });

  it("attaches seasons for TV series", async () => {
    mockCore.resolveSlug.mockResolvedValue(VALID_SUBJECT_ID);
    mockCore.getItemDetails.mockResolvedValue({
      subjectId: VALID_SUBJECT_ID,
      title: "Test Series",
      subjectType: 2,
      dubs: [],
      subtitles: [],
    });
    mockCore.getSeasonDetails.mockResolvedValue({
      seasons: [{ season: 1, episodes: 10 }],
    });
    mockCore.getResources.mockResolvedValue({ list: [] });

    const res = await request(app).get(`/detail/${MOCK_SLUG}`);
    expect(res.status).toBe(200);
    expect(res.body.data.seasons).toBeDefined();
    expect(mockCore.getSeasonDetails).toHaveBeenCalled();
  });
});

describe("GET /episodes/:slug", () => {
  it("returns season/episode info", async () => {
    mockCore.resolveSlug.mockResolvedValue(VALID_SUBJECT_ID);
    mockCore.getSeasonDetails.mockResolvedValue({
      seasons: [{ season: 1, episodes: 10 }],
    });

    const res = await request(app).get(`/episodes/${MOCK_SLUG}`);
    expect(res.status).toBe(200);
    expect(res.body.data.seasons).toHaveLength(1);
  });
});

// ===========================================================================
// ▶️ Streaming
// ===========================================================================

describe("GET /api/stream/:subject_id", () => {
  it("returns stream URLs", async () => {
    mockCore.getItemDetails.mockResolvedValue({ dubs: [] });
    mockCore.getResources.mockResolvedValue({
      list: [
        { resourceLink: "https://example.com/video.mp4", sourceUrl: "https://source.com/video.mp4", resourceId: VALID_RESOURCE_ID, linkType: 1, resolution: 1080, se: 0, ep: 0, size: "1 GB", duration: "2h", codecName: "h264", requireMemberType: 0, memberIcon: "", extCaptions: [] },
      ],
      subjectType: 1,
      subjectTitle: "Test Movie",
    });

    const res = await request(app).get(`/api/stream/${VALID_SUBJECT_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.streams).toHaveLength(1);
    expect(res.body.data.streams[0].url).toContain("example.com");
  });

  it("returns 400 for invalid subject_id", async () => {
    const res = await request(app).get("/api/stream/abc");
    expect(res.status).toBe(400);
  });

  it("returns 404 when no streams found", async () => {
    mockCore.getItemDetails.mockResolvedValue({ dubs: [] });
    mockCore.getResources.mockResolvedValue({ list: [] });

    const res = await request(app).get(`/api/stream/${VALID_SUBJECT_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("No streams found");
  });

  it("filters by season/episode", async () => {
    mockCore.getItemDetails.mockResolvedValue({ dubs: [] });
    mockCore.getResources.mockResolvedValue({
      list: [
        { resourceLink: "https://example.com/s1e1.mp4", resourceId: "r1", linkType: 1, resolution: 1080, se: 1, ep: 1, size: "500 MB", duration: "45m", codecName: "h264", requireMemberType: 0, memberIcon: "", extCaptions: [], sourceUrl: "" },
        { resourceLink: "https://example.com/s1e2.mp4", resourceId: "r2", linkType: 1, resolution: 1080, se: 1, ep: 2, size: "500 MB", duration: "45m", codecName: "h264", requireMemberType: 0, memberIcon: "", extCaptions: [], sourceUrl: "" },
      ],
      subjectType: 2,
      subjectTitle: "Test Series",
    });

    const res = await request(app).get(`/api/stream/${VALID_SUBJECT_ID}?se=1&ep=1`);
    expect(res.status).toBe(200);
    expect(res.body.data.streams).toHaveLength(1);
    expect(res.body.data.streams[0].episode).toBe(1);
  });
});

describe("GET /watch/:subject_id", () => {
  beforeEach(() => {
    mockGetRawStream.mockReset();
  });

  it("proxies video stream", async () => {
    mockCore.getItemDetails.mockResolvedValue({ dubs: [] });
    mockCore.getResources.mockResolvedValue({
      list: [
        { resourceLink: "https://example.com/video.mp4", resolution: 1080, se: 0, ep: 0 },
      ],
    });
    mockGetRawStream.mockResolvedValue({
      status: 200,
      headers: { get: () => null },
      body: null,
    });

    const res = await request(app).get(`/watch/${VALID_SUBJECT_ID}`);
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid subject_id", async () => {
    const res = await request(app).get("/watch/abc");
    expect(res.status).toBe(400);
  });

  it("returns 500 when no media files available (pickVideoFile throws)", async () => {
    mockCore.getItemDetails.mockResolvedValue({ dubs: [] });
    mockCore.getResources.mockResolvedValue({ list: [] });

    const res = await request(app).get(`/watch/${VALID_SUBJECT_ID}`);
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// 404 catch-all
// ===========================================================================

describe("404 catch-all", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await request(app).get("/nonexistent");
    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toContain("Unknown route");
  });

  it("returns 404 for unknown POST route", async () => {
    const res = await request(app).post("/api/nowhere");
    expect(res.status).toBe(404);
  });
});
