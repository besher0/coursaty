# Bunny video edge gateway

Bunny Edge Script that sits in front of Bunny Stream. The app never receives a
`b-cdn.net` URL: playback and download sessions return a gateway URL plus a
per-session token that the app sends in the `X-Coursaty-Playback-Session`
header on every request (master and variant playlists, segments, init, keys).

For each request the gateway:

1. Returns 403 when the header is missing, or when a token is passed in the
   query string (a copied link is useless on its own).
2. Asks the backend `POST /internal/video-edge/authorize` (authenticated with
   `X-Edge-Auth`) whether the token's session may read this path. The backend
   checks the session type, expiry, revocation and video, and allows HLS assets
   only (`m3u8`, `ts`, `m4s`, `aac`, `key`, `vtt`); MP4 and originals are denied.
3. Fetches the signed origin URL from the backend's answer, forwarding only
   `Range`, `Accept` and `User-Agent` (never the session token).
4. Rewrites absolute URLs inside playlists to the gateway origin (relative
   references are left as they are) and sets `Cache-Control: private, no-store`.

## Environment

| Variable | Value |
| --- | --- |
| `BACKEND_BASE_URL` | Public base URL of the API, e.g. `https://api.example.com/` |
| `VIDEO_EDGE_SHARED_SECRET` | Same value as the backend's `VIDEO_EDGE_SHARED_SECRET` |

The backend needs `VIDEO_GATEWAY_BASE_URL` set to the gateway's public origin.
Offline downloads fail with 502 when it is empty; there is no direct Bunny
fallback.

## Build and test

```bash
npm ci
npm run typecheck
npm run build
```

The behaviour tests (`src/handler.spec.ts`) run with the backend suite:
`npx jest infra/bunny-video-edge` from the repository root.

## Rollout order

1. Deploy this script and set its environment variables. It keeps serving
   existing playback sessions the same way.
2. Deploy the backend with the migrations (`prisma migrate deploy`), including
   `20261010_download_gateway_sessions`, and with `VIDEO_GATEWAY_BASE_URL` set.
3. Release the app version that sends the session header on downloads.

This is a coordinated change. From step 2, earlier app versions cannot start
new downloads (they do not send the header). The new app refuses the old
backend's direct links. Videos that are already downloaded keep playing
offline in both cases.
