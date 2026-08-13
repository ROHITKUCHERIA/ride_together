# RIDETOGETHER · Trip Room

A cinematic, full-screen trip-room landing page for the bike-trip social app **RIDETOGETHER**,
plus a NestJS + Prisma + PostgreSQL backend for real accounts and trips.

Visit `/trip/goa-2026` to enter the **GOA 2026** road trip — a digital room for the crew: huge
poster typography over a golden-hour highway backdrop, a floating music player, live rider
presence, playlists, trip info sharing, and a full-screen live map.

The frontend runs on realistic mock data. The backend (in `backend/`) is a real API with JWT
auth, refresh-token rotation, trip CRUD, invite-code joining, and role-based member management
(OWNER / ADMIN / MEMBER). Realtime hooks (connection status, rider presence drift) are still
simulated on the frontend — ready to be wired to a live transport (Socket.IO/WebSockets) layer.

## Tech stack

- React 19 + TypeScript
- Vite
- Tailwind CSS v4
- Framer Motion
- Lucide React
- Leaflet + OpenStreetMap / CARTO dark tiles (lazy-loaded only when the map opens)
- NestJS 11 + Prisma 7 + PostgreSQL/PostGIS (backend, in `backend/`)

## Scripts

```bash
npm install       # install frontend dependencies
npm run dev       # start dev server
npm run build     # type-check + production build
npm run lint      # oxlint
npm run preview   # preview the production build

npm run dev -- --host 192.168.13.195
```

### Backend (`backend/`)

```bash
cd backend
npm install
docker compose up -d db      # PostGIS on :5433
npx prisma migrate dev       # apply migrations
npx prisma generate          # regenerate client
npm run start:dev            # API on :3000/api (Swagger at /api/docs)
```

## Structure

```
src/
  App.tsx                       # entry — routes /trip/:slug (unknown slug → error state)
  types.ts                      # shared types (Rider, Song, Playlist, TripInfo, …)
  data/mockData.ts              # Goa 2026 mock trip, riders, songs, playlists, route
  hooks/useMediaQuery.ts
  components/
    TripRoom.tsx                # main composition + state
    TripHero.tsx                # cinematic background + giant poster typography
    TripNavigation.tsx          # minimal top nav (logo, trip name, providers, avatar)
    OnlineIndicator.tsx         # pulsing "N riders online"
    TripStats.tsx               # route + distance/riders/days line
    MusicPlayer.tsx             # floating desktop player / compact mobile bar + fullscreen panel
    MusicControls.tsx           # prev / play-pause / next
    Equalizer.tsx               # animated EQ bars
    AlbumArt.tsx                # original generated artwork (no copyrighted covers)
    PlaylistDrawer.tsx          # my + trip playlists, create playlist
    RidersDrawer.tsx            # member list with live status
    TripInfoDrawer.tsx          # trip metadata
    ShareTrip.tsx               # copy link / share / QR
    LiveMap.tsx                 # full-screen Leaflet map with route + rider pins
    MobileBottomNav.tsx         # Map · Music · Riders · Trip
    FloatingActions.tsx         # desktop action rail
    LoadingScreen.tsx           # cinematic intro
    ConnectionStatus.tsx        # live / reconnecting
    GpsStatus.tsx               # location unavailable → enable
    Drawer.tsx                  # reusable right-panel / bottom-sheet
    Avatar.tsx                  # initials avatar with status dot
    FilmGrain.tsx, CursorSpotlight.tsx

backend/
  src/
    main.ts                     # bootstrap — prefix /api, helmet, CORS, validation, Swagger
    app.module.ts               # module wiring + global JWT guard, error filter, transform interceptor
    auth/                       # register / login / refresh / logout, JWT strategy, refresh rotation
    users/                      # GET/PUT /users/me
    trips/                      # CRUD, invite-code join, status transitions (PLANNED/ACTIVE/…)
    trip-members/               # member list, role changes, removal, ownership transfer, leave
    common/                     # guards, decorators, unified exception filter, pagination, trip-access
    config/                     # typed AppConfig (env)
    prisma/                     # PrismaService (Postgres driver adapter)
  prisma/schema.prisma          # User, Trip, TripMember, RefreshToken (+ PostGIS notes)
  generated/prisma/             # generated Prisma client (moduleFormat cjs)
```

## API notes

- Every response is `{ success: true, data, meta? }`; every error is
  `{ success: false, message, errorCode }` (see `common/filters`).
- All routes require a `Bearer` JWT unless marked `@Public()` (register/login/refresh/health).
- Auth: refresh tokens are hashed in the DB, rotated on use, and reuse is detected.
- Trips: owner + admins manage details; only the owner can transfer/delete; roles are
  enforced server-side via `TripAccessService`.

## Notes

- Background image: royalty-free Unsplash photo (Unsplash License), bundled locally in
  `public/images/` at two widths for responsive delivery.
- Music is not hosted or streamed here. Provider shortcuts open Spotify / YouTube Music
  externally.
- Screenshots from automated browser verification are in `shots/`.
