/**
 * Vercel Edge Function adapter for MovieBox API.
 *
 * Imports the core logic from worker.js and wraps it for Vercel's Edge Runtime.
 *
 * ─── Deploy ────────────────────────────────────────────────────────────────
 *   1. Connect this repo to Vercel
 *   2. Add env vars in Vercel Dashboard (optional):
 *        MOVIEBOX_SECRET_KEY_DEFAULT
 *        MOVIEBOX_SECRET_KEY_ALT
 *        MOVIEBOX_AUTH_TOKEN
 *        TAB_HOME, TAB_MOVIE, TAB_TV, TAB_ANIMATION, TAB_RANKING
 *   3. Deploy
 */

import { handleRequest } from '../worker.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  const env = {
    TAB_HOME: process.env.TAB_HOME ?? '',
    TAB_MOVIE: process.env.TAB_MOVIE ?? '',
    TAB_TV: process.env.TAB_TV ?? '',
    TAB_ANIMATION: process.env.TAB_ANIMATION ?? '',
    TAB_RANKING: process.env.TAB_RANKING ?? '',
    MOVIEBOX_SECRET_KEY_DEFAULT: process.env.MOVIEBOX_SECRET_KEY_DEFAULT ?? '',
    MOVIEBOX_SECRET_KEY_ALT: process.env.MOVIEBOX_SECRET_KEY_ALT ?? '',
    MOVIEBOX_AUTH_TOKEN: process.env.MOVIEBOX_AUTH_TOKEN ?? '',
  };
  return handleRequest(request, env);
}
