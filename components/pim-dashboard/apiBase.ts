/*
 * Origin of the Next.js API routes, resolved for whichever host the dashboard
 * is running in.
 *
 * Embedded in the Next app (/studio): the API is same-origin, so an empty base
 * produces a relative URL that is correct on any port. Never hardcode a port
 * here — the dev server does not always get 3000.
 *
 * Standalone Sanity CLI Studio (Vite, :3333): a different origin, so it must be
 * told where the Next app lives. Vite exposes only SANITY_STUDIO_* variables,
 * so that is the one to set in .env.local.
 *
 * Whatever origin the Studio is served from must also be listed in
 * ALLOWED_ORIGINS in proxy.ts, or the browser will block the response.
 */
export const API_BASE = process.env.SANITY_STUDIO_APP_URL ?? ''
