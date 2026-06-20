"use strict";

/**
 * crypto.js
 *
 * Implements the request-signing scheme used by the MovieBox Android API:
 *   - X-Client-Token  : "<timestamp_ms>,<md5(reverse(timestamp_ms))>"
 *   - x-tr-signature  : "<timestamp_ms>|2|<base64(hmac-md5(canonical, key))>"
 */

const nodeCrypto = require("crypto");
const {
  SECRET_KEY_DEFAULT,
  SECRET_KEY_ALT,
  SIGNATURE_BODY_MAX_BYTES,
} = require("./constants");

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Returns lowercase hex MD5 of a Buffer or string. */
function md5Hex(data) {
  return nodeCrypto.createHash("md5").update(data).digest("hex");
}

/**
 * Decodes a standard-alphabet base64 string, adding padding when needed.
 * @param {string} value
 * @returns {Buffer}
 */
function b64Decode(value) {
  const padding = (4 - (value.length % 4)) % 4;
  return Buffer.from(value + "=".repeat(padding), "base64");
}

/** Encodes a Buffer (or anything Buffer.from accepts) to a base64 string. */
function b64Encode(data) {
  return Buffer.from(data).toString("base64");
}

// ---------------------------------------------------------------------------
// X-Client-Token
// ---------------------------------------------------------------------------

/**
 * Generates the X-Client-Token header value.
 *   token = "<ts>,<md5(reverse(ts))>"
 * @param {number} [timestampMs]
 * @returns {string}
 */
function generateXClientToken(timestampMs) {
  const ts = String(timestampMs !== undefined ? timestampMs : Date.now());
  const reversed = ts.split("").reverse().join("");
  const hash = md5Hex(reversed);
  return `${ts},${hash}`;
}

// ---------------------------------------------------------------------------
// Canonical string for x-tr-signature
// ---------------------------------------------------------------------------

/**
 * Rebuilds the query string with keys in sorted order.
 * Values are NOT percent-encoded (mirrors Python's parse_qs + manual join).
 * @param {string} url  Absolute or relative URL.
 * @returns {string}
 */
function _sortedQueryString(url) {
  let searchParams;
  try {
    searchParams = new URL(url).searchParams;
  } catch {
    // Relative URL: prepend a dummy base so URL() can parse it.
    const safe = url.startsWith("/") ? `http://x${url}` : `http://x/${url}`;
    searchParams = new URL(safe).searchParams;
  }

  // Collect all values per key (multiple values allowed)
  const map = /** @type {Record<string, string[]>} */ ({});
  for (const [k, v] of searchParams) {
    if (!map[k]) map[k] = [];
    map[k].push(v);
  }

  // Sort keys, then join without encoding
  const parts = [];
  for (const key of Object.keys(map).sort()) {
    for (const val of map[key]) {
      parts.push(`${key}=${val}`);
    }
  }
  return parts.join("&");
}

/**
 * Builds the canonical string that is HMAC-signed for x-tr-signature.
 *
 * Format (each field on its own line, joined with \n):
 *   METHOD
 *   Accept header value (or empty)
 *   Content-Type header value (or empty)
 *   Body byte length as string (or empty)
 *   Timestamp in milliseconds
 *   MD5 of the first SIGNATURE_BODY_MAX_BYTES bytes of the body (or empty)
 *   Canonical URL = <path>[?<sorted-query>]
 *
 * @param {string}      method
 * @param {string|null} accept
 * @param {string|null} contentType
 * @param {string}      url          Full absolute URL (base + path + query).
 * @param {string|null} body         Raw request body string, or null.
 * @param {number}      timestampMs
 * @returns {string}
 */
function buildCanonicalString(
  method,
  accept,
  contentType,
  url,
  body,
  timestampMs,
) {
  // Extract path and sorted query from the URL
  let path = "";
  let query = "";
  try {
    const parsed = new URL(url);
    path = parsed.pathname || "";
    query = _sortedQueryString(url);
  } catch {
    const idx = url.indexOf("?");
    if (idx >= 0) {
      path = url.slice(0, idx);
      query = _sortedQueryString(url);
    } else {
      path = url;
    }
  }

  const canonicalUrl = query ? `${path}?${query}` : path;

  // Body digest
  let bodyHash = "";
  let bodyLength = "";
  if (body !== null && body !== undefined) {
    const bodyBuf = Buffer.from(body, "utf-8");
    const truncated = bodyBuf.slice(0, SIGNATURE_BODY_MAX_BYTES);
    bodyHash = md5Hex(truncated);
    bodyLength = String(bodyBuf.length);
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

// ---------------------------------------------------------------------------
// x-tr-signature
// ---------------------------------------------------------------------------

/**
 * Returns the x-tr-signature header value:
 *   "<ts>|2|<base64(hmac-md5(canonical, key))>"
 *
 * @param {string}      method
 * @param {string|null} accept
 * @param {string|null} contentType
 * @param {string}      url
 * @param {string|null} [body]
 * @param {boolean}     [useAltKey]
 * @param {number|null} [timestampMs]
 * @returns {string}
 */
function generateXTrSignature(
  method,
  accept,
  contentType,
  url,
  body = null,
  useAltKey = false,
  timestampMs = null,
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
  const secretB64 = useAltKey ? SECRET_KEY_ALT : SECRET_KEY_DEFAULT;
  const secretKey = b64Decode(secretB64);
  const mac = nodeCrypto
    .createHmac("md5", secretKey)
    .update(canonical, "utf-8")
    .digest();
  return `${ts}|2|${b64Encode(mac)}`;
}

// ---------------------------------------------------------------------------
// Full signed header set
// ---------------------------------------------------------------------------

/**
 * Assembles the complete set of signed request headers.
 *
 * @param {object} opts
 * @param {string}      opts.method
 * @param {string}      opts.url           Full absolute URL (including query).
 * @param {string}      [opts.accept]
 * @param {string}      [opts.contentType]
 * @param {string|null} [opts.body]
 * @param {boolean}     [opts.includePlayMode]
 * @param {string|null} [opts.authToken]
 * @param {string}      [opts.clientInfo]
 * @param {string}      [opts.userAgent]
 * @returns {Record<string, string>}
 */
function buildSignedHeaders({
  method,
  url,
  accept = "application/json",
  contentType = "application/json",
  body = null,
  includePlayMode = false,
  authToken = null,
  clientInfo = "",
  userAgent = "",
}) {
  const ts = Date.now();
  const headers = {
    "User-Agent": userAgent,
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
    ),
    "X-Client-Info": clientInfo,
    "X-Client-Status": "0",
  };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  if (includePlayMode) headers["X-Play-Mode"] = "2";
  return headers;
}

module.exports = { buildSignedHeaders };
