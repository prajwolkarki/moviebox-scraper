"use strict";

/**
 * client.js
 *
 * Provides an async HTTP client that:
 *   - Signs every request with X-Client-Token / x-tr-signature.
 *   - Tries each host in HOST_POOL in order, falling back on retryable codes.
 *   - Absorbs the x-user response header to refresh the bearer token.
 *   - Exposes getFromApi / postToApi helpers that unwrap the { code, data } envelope.
 */

const { buildSignedHeaders } = require("./crypto");
const {
  HOST_POOL,
  DEFAULT_API_BASE,
  RETRY_STATUS_CODES,
  AUTH_TOKEN,
  USER_AGENT,
  CLIENT_INFO,
} = require("./constants");

class MovieBoxClient {
  /**
   * @param {object} [opts]
   * @param {string[]} [opts.hostPool]   Override the default host pool.
   * @param {number}   [opts.timeout]    Request timeout in ms (default 20 000).
   */
  constructor(opts = {}) {
    this.hostPool = opts.hostPool || HOST_POOL;
    this.activeBase = DEFAULT_API_BASE;
    /** Runtime bearer token absorbed from x-user response headers. */
    this.runtimeToken = null;
    this.timeout = opts.timeout || 20_000;
  }

  // ---------------------------------------------------------------------------
  // Token helpers
  // ---------------------------------------------------------------------------

  get _effectiveToken() {
    return this.runtimeToken || AUTH_TOKEN;
  }

  /**
   * Parses the x-user header and updates runtimeToken if a fresh token is present.
   * @param {Headers} headers
   */
  _absorbXUser(headers) {
    const raw = headers.get("x-user");
    if (!raw) return;
    try {
      const payload = JSON.parse(raw);
      if (payload && payload.token) this.runtimeToken = payload.token;
    } catch {
      /* ignore malformed header */
    }
  }

  // ---------------------------------------------------------------------------
  // URL helpers
  // ---------------------------------------------------------------------------

  /**
   * Merges extra params into a path+query string.
   * Existing query params are preserved; new ones are appended.
   * @param {string}              path
   * @param {Record<string, any>} params
   * @returns {string}
   */
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

  // ---------------------------------------------------------------------------
  // Core request with host-pool fallback
  // ---------------------------------------------------------------------------

  /**
   * Executes a request, cycling through HOST_POOL on retryable status codes.
   *
   * @param {string} method         'GET' | 'POST'
   * @param {string} pathAndQuery   API path (with any query string already built in).
   * @param {object} [opts]
   * @param {string}      [opts.accept]
   * @param {string}      [opts.contentType]
   * @param {string|null} [opts.body]        Serialised request body.
   * @param {boolean}     [opts.includePlayMode]
   * @returns {Promise<{ base: string, response: Response }>}
   */
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
        clientInfo: CLIENT_INFO,
        userAgent: USER_AGENT,
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
        // Retryable — consume body to free the socket, then try next host.
        await response.text().catch(() => {});
      } catch (err) {
        lastError = err;
      }
    }

    if (!lastResponse) {
      throw new Error(
        `All hosts in the pool failed for ${pathAndQuery}. ` +
          `Last error: ${lastError?.message || "unknown"}`,
      );
    }
    return { base: this.activeBase, response: lastResponse };
  }

  // ---------------------------------------------------------------------------
  // Response processing
  // ---------------------------------------------------------------------------

  /**
   * Validates and unwraps the standard { code, message, data } API envelope.
   * Mirrors v1/helpers.py:process_api_response().
   * @param {Response} response
   * @returns {Promise<any>}  The `data` field of a successful response.
   */
  async _processApiResponse(response) {
    const ct = response.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const body = await response.text().catch(() => "<unreadable>");
      throw new Error(
        `Unexpected content-type '${ct}' (HTTP ${response.status}): ${body}`,
      );
    }

    const json = await response.json();

    if (json.code === 0 && json.message === "ok") {
      return json.data;
    }

    throw new Error(
      `API error – code: ${json.code}, message: ${json.message} ` +
        `(HTTP ${response.status})`,
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Signed GET request → unwrapped data field.
   * @param {string}              path
   * @param {Record<string, any>} [params]
   * @returns {Promise<any>}
   */
  async getFromApi(path, params) {
    const fullPath = params ? MovieBoxClient._mergeParams(path, params) : path;
    const { response } = await this._request("GET", fullPath);
    return this._processApiResponse(response);
  }

  /**
   * Signed POST request → unwrapped data field.
   * @param {string} path
   * @param {any}    body   Plain object – will be JSON-serialised.
   * @param {Record<string, any>} [params]
   * @returns {Promise<any>}
   */
  async postToApi(path, body, params) {
    const fullPath = params ? MovieBoxClient._mergeParams(path, params) : path;
    const bodyStr = JSON.stringify(body);
    const { response } = await this._request("POST", fullPath, {
      contentType: "application/json; charset=utf-8",
      body: bodyStr,
    });
    return this._processApiResponse(response);
  }

  /**
   * Fetches a raw (unsigned) URL and returns the live Response for streaming.
   * Range headers pass through unchanged.
   * @param {string}                    url
   * @param {Record<string, string>}    headers
   * @param {number}                    [timeoutMs]
   * @returns {Promise<Response>}
   */
  async getRawStream(url, headers = {}, timeoutMs = 30_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timer);
    return response;
  }
}

module.exports = { MovieBoxClient };
