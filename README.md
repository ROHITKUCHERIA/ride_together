# RIDETOGETHER · Trip Room

A cinematic, full-screen trip-room landing page for the bike-trip social app **RIDETOGETHER**.

Visit `/trip/goa-2026` to enter the **GOA 2026** road trip — a digital room for the crew: huge
poster typography over a golden-hour highway backdrop, a floating music player, live rider
presence, playlists, trip info sharing, and a full-screen live map.

Frontend-only for now. All data is realistic mock data — no backend, no database, no auth, no
real GPS/Socket.IO yet. Realtime hooks (connection status, rider presence drift) are simulated
so the UI is ready to be wired to a backend later.

## Tech stack

- React 19 + TypeScript
- Vite
- Tailwind CSS v4
- Framer Motion
- Lucide React
- Leaflet + OpenStreetMap / CARTO dark tiles (lazy-loaded only when the map opens)

## Scripts

```bash
npm install       # install dependencies
npm run dev       # start dev server
npm run build     # type-check + production build
npm run lint      # oxlint
npm run preview   # preview the production build

npm run dev -- --host 192.168.13.195
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
```

## Notes

- Background image: royalty-free Unsplash photo (Unsplash License), bundled locally in
  `public/images/` at two widths for responsive delivery.
- Music is not hosted or streamed here. Provider shortcuts open Spotify / YouTube Music
  externally.
- Screenshots from automated browser verification are in `shots/`.
