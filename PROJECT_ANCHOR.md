# ASTRA — Project Anchor

## What This Is
Astra is a cost intelligence engine for electrical contractors, built as a Progressive Web App (PWA). Job tracking is the data acquisition layer. The estimator is the core product. Every logged job feeds back into the estimator. Every material used at an address becomes historical data.

## Who Built This
Solo developer, working electrician in Houston TX. Building this to solve his own problems first, then scale to small shops (1-6 techs).

## Tech Stack
- **Vanilla JS** — no frameworks, no build step, no package manager
- **IndexedDB** — primary data store for all business data
- **Supabase** — cloud sync (push/pull, realtime, vendored client library)
- **Service Worker** — cache-first, auto-update with orange banner
- **PWA** — installable, runs from home screen

## Architecture Rules
- Offline-first is non-negotiable. Local state is ALWAYS canonical. Supabase is cloud backup.
- All reads are synchronous from in-memory cache. IDB syncs in background.
- No frameworks. No build step. No npm. No runtime dependencies except Supabase and Google Maps.
- Modular IIFE architecture — each module reads from window.Astra, exposes functions on window.

## Key Files
- `index.html` — app shell + all CSS, all screen HTML
- `app.js` — core IIFE: data layer, navigation, ticket CRUD, settings
- `astra-estimates.js` — estimates IIFE: builder, price book, intelligence, feedback loop
- `astra-materials.js` — materials IIFE: catalog, picker, search
- `astra-maps.js` — maps IIFE: Google Maps, Vector route
- `astra-sync.js` — sync IIFE: Supabase push/pull, realtime, auto-sync
- `supabase.min.js` — vendored Supabase client (no CDN dependency)
- `sw.js` — service worker (cache version bumps on every deploy)
- `diagnostics.html` — standalone test suite (not linked from main app)
- `multi-device-test.js` — Playwright multi-device sync test harness
- `rough_materials.json` / `trim_materials.json` — material catalogs

## Current Features (v0.7)
- Ticket CRUD with status, dates, tech assignment, materials, media
- Estimate builder with recalc engine, price book, shareable output
- Phase B intelligence: similar jobs, address history, property intel
- Phase D feedback loop: estimated vs actual comparison, accuracy metrics
- Material library (222 items, rough + trim, searchable)
- Address database with property intelligence (panel, amps, breaker, builder)
- Auto-sync with dirty flag, debounced push, exponential backoff
- Supabase cloud sync with timestamp protection (local wins if newer)
- Realtime cross-device sync
- Google Maps + Vector route optimization
- Full-text search, daily/weekly views, archive
- Export/import JSON backup
- 127+ automated diagnostic tests
