# RideTogether · Stage 10 — Production Reference

Operational guide for the backend (`backend/`) and frontend at the point group
navigation (Phase 3) lands. It consolidates environment variables, the external
services the API talks to, Redis usage, rate limits, cache keys, realtime
events, and the navigation REST surface — everything an operator needs to run
and reason about the deployment.

Stack: NestJS 11 · Prisma 7 · PostgreSQL/PostGIS 16 · Redis 7 · Socket.IO ·
React 19 + Vite. Secrets only ever live in `backend/.env` (or the platform's
secret store); nothing `VITE_`-prefixed is a secret.

---

## 1. Topology

```
Browser (React) ── REST /api/*  (JWT Bearer) ──┐
   │                                            ├──► NestJS API (:3000)
   └── Socket.IO (same origin) ─────────────────┘        │
                                                         ├──► PostgreSQL/PostGIS (:5433)
                                                         ├──► Redis (:6379)   [route cache + reroute cooldown]
                                                         ├──► OSRM routing API (server-side only)
                                                         ├──► Nominatim geocoding API (server-side only)
                                                         └──► YouTube Data API v3 (server-side only)
```

- REST and Socket.IO share the origin and the JWT strategy.
- External API keys/URLs are resolved **server-side** and never exposed to the
  frontend. The browser only ever talks to `backend/origin`.
- Global prefix `/api`; interactive Swagger at `/api/docs`.

## 2. Environment variables

### 2.1 Backend (`backend/.env` — see `backend/.env.example`)

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | *(required)* | Postgres/PostGIS connection string (`postgresql://USER:PASS@host:5432/db?schema=public`). |
| `PORT` | `3000` | API port. |
| `NODE_ENV` | `development` | |
| `FRONTEND_URL` | `http://localhost:5173` | Exact CORS origin for HTTP **and** Socket.IO (never `*`). |
| `JWT_ACCESS_SECRET` | *(required)* | Sign long random strings (`openssl rand -hex 32`). |
| `JWT_REFRESH_SECRET` | *(required)* | Rotate on release. |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | |
| `REFRESH_HASH_PEPPER` | `""` | Falls back to `JWT_REFRESH_SECRET` when empty. |
| `REDIS_URL` | `""` | Empty → in-memory fallbacks for route cache + reroute cooldown (**single instance only**). Set `redis://...` in production. |
| `ROUTING_PROVIDER` | `osrm` | Only `osrm` implemented. |
| `ROUTING_API_URL` | `https://router.project-osrm.org` | Point at a self-hosted OSRM for prod. |
| `ROUTING_TIMEOUT_MS` | `10000` | |
| `GEOCODING_PROVIDER` | `nominatim` | Only `nominatim` implemented. |
| `GEOCODING_API_URL` | `https://nominatim.openstreetmap.org` | Self-host Nominatim for prod traffic. |
| `GEOCODING_TIMEOUT_MS` | `10000` | |
| `YOUTUBE_API_KEY` | `""` | Backend-only; never via `VITE_*`. |
| `YOUTUBE_SEARCH_CACHE_TTL_MS` | `900000` | Protects YouTube quota on repeat queries. |
| `YOUTUBE_SEARCH_MAX_RESULTS` | `10` | |
| `YOUTUBE_SEARCH_MAX_QUERY_LENGTH` | `200` | |
| `LOCATION_UPDATE_MIN_INTERVAL_MS` | `3000` | Min gap between accepted GPS updates per rider. |
| `RIDER_LIVE_THRESHOLD_MS` | `15000` | |
| `RIDER_DELAYED_THRESHOLD_MS` | `60000` | |
| `LOCATION_MAX_AGE_MS` | `300000` | Reject stale GPS timestamps. |
| `LOCATION_MAX_FUTURE_MS` | `30000` | Reject future-dated GPS timestamps. |
| `NAVIGATION_ROUTE_CACHE_TTL_SECONDS` | `300` | Route cache TTL. |
| `NAVIGATION_ROUTE_THROTTLE_TTL_MS` | `60000` | Window for the route-scoped limit. |
| `NAVIGATION_ROUTE_THROTTLE_LIMIT` | `20` | Max `route` calls / window / user+IP. |
| `NAVIGATION_GEOCODE_THROTTLE_TTL_MS` | `60000` | |
| `NAVIGATION_GEOCODE_THROTTLE_LIMIT` | `30` | |
| `NAVIGATION_STATUS_MIN_INTERVAL_MS` | `5000` | Min gap between accepted status updates per rider (spam valve). |
| `NAVIGATION_REROUTE_COOLDOWN_SECONDS` | `15` | Length of a rider's reroute lock. |
| `NAVIGATION_STATUS_THROTTLE_TTL_MS` | `60000` | |
| `NAVIGATION_STATUS_THROTTLE_LIMIT` | `60` | |
| `NAVIGATION_DESTINATION_THROTTLE_TTL_MS` | `60000` | |
| `NAVIGATION_DESTINATION_THROTTLE_LIMIT` | `30` | |
| `NAVIGATION_SESSION_STALE_AFTER_MS` | `1800000` | Session snapshot staleness cut-off (derived, not stored). |

### 2.2 Frontend (`.env` — see `.env.example`)

All vars are client-visible by definition. Only the ones relevant to the live
map + navigation are listed; the phase tuning knobs
(`VITE_NAV_*`, `VITE_PRESENCE_*`, `VITE_GPS_*`) are documented inline in
`.env.example`.

| Variable | Default | Notes |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:3000` | REST + Socket.IO share this origin. |
| `VITE_USE_REALTIME_BACKEND` | `false` | `true` opts the demo route into the real backend too. |
| `VITE_BACKEND_TRIP_ID` | `""` | Explicit trip id; empty uses the first joined trip. |
| `VITE_ACCESS_TOKEN` | `""` | Optional pre-issued access token for dev. |
| `VITE_DEV_EMAIL` / `VITE_DEV_PASSWORD` | `demo@ridetogether.app` / `Demo1234!` | Demo login. |
| `VITE_OSRM_URL` | `https://router.project-osrm.org` | Direct OSRM fallback only when there is **no** backend session. |
| `VITE_NOMINATIM_URL` | `https://nominatim.openstreetmap.org` | Straight-line geocode fallback. |

---

## 3. Redis

Enabled by `REDIS_URL` (`redis://localhost:6379`, `redis:7-alpine` in
`backend/docker-compose.yml`). Graceful degradation: when unset **or**
connection fails, cache and cooldown transparently fall back to in-process
storage — identical behaviour, but only correct for a **single API instance**.

### 3.1 Keys

| Key | Purpose | TTL |
| --- | --- | --- |
| `rt:route:{provider}:route:{originLng},{originLat}:{destLng},{destLat}` | Normalized driving route (JSON). Prefix `rt:route:`, provider `osrm:`; coordinates `toFixed(5)` (~1.1 m) so GPS jitter shares entries. | `NAVIGATION_ROUTE_CACHE_TTL_SECONDS` (300) |
| `rt:reroute-cooldown:{tripId}:{userId}` | Distributed reroute lock, value = `requestId`. Acquired with `SET NX`; serves both cooldown and idempotency (same `requestId` passes while the lock is held). | `NAVIGATION_REROUTE_COOLDOWN_SECONDS` (15) |

### 3.2 Failure modes

- Redis down → `RedisService` logs a warning and every call no-ops; the
  in-memory route cache and in-memory cooldown map take over (per-instance).
- Reroute lock lost in a crash → expires by TTL (15 s), no manual cleanup.

---

## 4. External services

- **OSRM** (`ROUTING_API_URL`): `GET /route/v1/driving/{lng,lat};{lng,lat}?overview=full&geometries=geojson&steps=true`. The public `router.project-osrm.org` is a **development default only** — self-host before production. Errors surface as `ROUTING_UNAVAILABLE` (503) / `ROUTE_NOT_FOUND` (422).
- **Nominatim** (`GEOCODING_API_URL`): used by frontend search through the backend proxy (route-scoped throttle). Errors: `GEOCODING_UNAVAILABLE`.
- **YouTube Data API v3** (`YOUTUBE_API_KEY`): music search/lookup. Quota is rate-limited client-side and cached (`YOUTUBE_SEARCH_CACHE_TTL_MS`).

---

## 5. Rate limits

Global `ThrottlerGuard` applies everywhere; per-endpoint `@Throttle({ navigation })`
limits are layered on the navigation surface (the named `navigation` scorer).
`RATE_LIMITED` error (429) is returned on any breach — the E2E suite asserts
this for reroutes.

| Endpoint(s) | Limit / window | Env |
| --- | --- | --- |
| `POST /api/navigation/route` | 20 / 60 s | `NAVIGATION_ROUTE_THROTTLE_*` |
| `GET /api/navigation/geocode` | 30 / 60 s | `NAVIGATION_GEOCODE_THROTTLE_*` |
| `POST`/`PATCH /api/trips/:tripId/navigation/session` | 60 / 60 s | `NAVIGATION_STATUS_THROTTLE_*` |
| `POST /api/trips/:tripId/navigation/reroute` | 20 / 60 s | (reuses route throttle) |
| `PUT`/`DELETE /api/trips/:tripId/destination` | 30 / 60 s | `NAVIGATION_DESTINATION_THROTTLE_*` |

Independent of the rate limit, a status update is treated as **trivial** (and
not persisted/broadcast) when it arrives within
`NAVIGATION_STATUS_MIN_INTERVAL_MS`, the status is unchanged, and the ETA moved
by less than 60 s — except the rider's **first** ETA report (null → value),
which is always meaningful.

---

## 6. Socket.IO events

Broadcast over the trip room (`trip:{tripId}` namespace on the shared server).
Names are centralized in the backend `NavigationEvents` constant and mirrored
client-side in `SocketRealtimeService`.

| Event | Payload | Fired |
| --- | --- | --- |
| `trip:destination-updated` | `{ tripId, destination: { latitude, longitude, name?, setByUserId?, setAt? } }` | Host `PUT /api/trips/:id/destination`. |
| `trip:destination-cleared` | `{ tripId, destination: null }` | Host `DELETE /api/trips/:id/destination`. |
| `navigation:started` | `NavigationSessionPayload` | Rider starts a **group** session. |
| `navigation:stopped` | `NavigationSessionPayload` (status `idle`) | Rider stops / deletes session. |
| `navigation:rerouting` | `NavigationSessionPayload` | Rider entered rerouting phase. |
| `navigation:rerouted` | `NavigationSessionPayload` | Rider completed a reroute (rerouting → navigating). |
| `navigation:arrived` | `NavigationSessionPayload` | Rider arrived. |
| `navigation:gps-lost` | `NavigationSessionPayload` | Rider lost GPS while navigating. |
| `navigation:status` | `NavigationSessionPayload` | Any other status/ETA transition; also emitted on socket **disconnect** (`offline`). |

`NavigationSessionPayload` (wire format, lowercase):
`{ tripId, userId, mode: 'group'|'personal', status, distanceRemainingMeters?, eta? (epoch ms), destination? { latitude, longitude, name? }, updatedAt (ISO) }`.

Statuses: `idle | navigating | off_route | rerouting | arrived | gps_lost | offline`.
Group ETA = maximum `eta` among riders with an active status
(`navigating | off_route | rerouting`); arrived/offline/idle are excluded.

Only **group** sessions are broadcast — personal sessions persist purely for
their own rider's reconnect restore.

---

## 7. Navigation REST API (all JWT-protected, members only)

Response envelope: `{ success: true, data, meta? }`. Error envelope:
`{ success: false, message, errorCode }`.

### 7.1 Shared destination (`/api/trips/:tripId/destination`)

| Method | Description | Authz |
| --- | --- | --- |
| `PUT` | Body `{ latitude, longitude, name? }`. Writes `destination_geo` via PostGIS `ST_SetSRID(ST_MakePoint(lng, lat), 4326)`; broadcasts `trip:destination-updated`. | Host/OWNER only |
| `GET` | `{ destination: { latitude, longitude, name?, setByUserId?, setAt? } | null }`. | Members |
| `DELETE` | Clears coords/null geo; broadcasts `trip:destination-cleared`. | Host/OWNER only |

### 7.2 Group navigation (`/api/trips/:tripId/navigation`)

| Method | Description |
| --- | --- |
| `GET` | Group snapshot `{ destination, riders: NavigationSessionPayload[], groupEta }` — the reconnect-recovery source of truth. |
| `POST /session` | Start (or restart) my session. Body `{ mode='group' | 'personal', destinationLatitude?, destinationLongitude?, destinationName? }`. Group mode requires the shared destination (`NO_TRIP_DESTINATION` otherwise). |
| `PATCH /session` | Update my status/ETA. Body `{ status, eta?, distanceRemainingMeters? }`. 404 `NAV_SESSION_NOT_FOUND` when no session. |
| `DELETE /session` | Stop + persist-delete my session; broadcasts `navigation:stopped`. |
| `POST /reroute` | Group reroute through the routing engine. Body `{ origin: {latitude, longitude}, destination: {latitude, longitude}, requestId (UUID) }`. Acquires the cooldown lock; 429 `REROUTE_COOLDOWN` when another is in flight (because the lock is per-`requestId`, the same request id **retries idempotently**); the lock is released early on routing failure. Echoes `requestId` back with `{ requestId, route }`. |

Personal sessions: `mode: 'personal'` sessions are stored but never broadcast.

---

## 8. Cache & invalidation behaviour

- Route cache is **write-through** (filled after a successful OSRM fetch) with
  TTL `NAVIGATION_ROUTE_CACHE_TTL_SECONDS`; keys are coordinates-normalized so
  a jittering rider reuses entries.
- Reroute cooldown is **release-on-failure** — a failed route frees the lock so
  the rider can retry immediately instead of waiting out the TTL.
- The frontend additionally caches routes locally per origin/dest
  (`VITE_NAV_ROUTE_CACHE_TTL_MS`) and uses the backend `requestId` echo to
  discard **stale** reroute responses — a slower older reroute can never
  overwrite a fresher route.

---

## 9. Reconnect / recovery flow

1. On trip open (real mode) the browser opens one Socket.IO connection and
   joins the trip room.
2. A rider that reconnects (transport drop → `connected`) calls
   `GET /api/trips/:tripId/navigation` and refills the client group store —
   destination, rider states, group ETA.
3. While disconnected, the room's socket-disconnect hook marks a departing
   rider's group session `offline` immediately and broadcasts
   `navigation:status` — no waiting for the 60 s presence sweep.
4. Snapshot staleness is derived server-side from
   `NAVIGATION_SESSION_STALE_AFTER_MS`; nothing stores GPS history — sessions
   hold status/ETA transitions only.

---

## 10. Production ops checklist

- [ ] `DATABASE_URL` + both JWT secrets set (long, random); `REFRESH_HASH_PEPPER` unique.
- [ ] `REDIS_URL` set to a managed/HA Redis (else the route cache + reroute cooldown fall back to per-instance memory, which breaks distributed cooldown semantics across instances).
- [ ] `ROUTING_API_URL` points at self-hosted OSRM (never the public dev router at scale).
- [ ] `GEOCODING_API_URL` self-hosted or a commercial Nominatim-compatible provider under your usage terms.
- [ ] `FRONTEND_URL` matches the deployed origin exactly (CORS for HTTP and Socket.IO).
- [ ] `YOUTUBE_API_KEY` in the backend secret store; never in frontend `.env`.
- [ ] Run `npm run db:migrate` (deploy strategy) before rolling the API.
- [ ] Verify: `npm test` (unit), `npm run build`, `npm run lint`, and `npm run test:e2e` (needs the DB up; the Redis service degrades gracefully in CI).

## 11. Verification commands

```bash
# Backend (from backend/)
npm test                 # 258 unit tests / 25 suites
npm run build
npx eslint "src/**/*.ts" "test/**/*.ts"   # 0 errors in src except pre-existing
                                         # src/music/youtube.service.ts (25) — not fixed, not Phase 3
npm run test:e2e         # 109 tests / 6 suites incl. navigation.e2e-spec

# Frontend (from repo root)
npm test                 # 204 tests / 27 files
npm run build
npm run lint             # 0 errors (3 pre-existing fast-refresh warnings)
```