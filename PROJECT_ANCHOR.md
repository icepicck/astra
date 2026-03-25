# ASTRA — Project Anchor

## What This Is
Astra is a Progressive Web App (PWA) for residential electrical field service management. It's built for electricians working job sites — dirty hands, one bar of signal, foreman waiting on a materials list. Everything must work offline.

## Who Built This
Solo developer, working electrician in Houston TX. Works for IES Residential. Building this to solve his own problems first, then scale.

## Tech Stack
- **Vanilla JS** — no frameworks, no build step, no dependencies
- **IndexedDB** — primary data store (migrated from localStorage)
- **Service Worker** — cache-first with 3s network timeout, full offline support
- **PWA** — installable, runs from home screen on Samsung S21

## Architecture Rules
- Offline-first is non-negotiable. Everything works without network.
- All reads are synchronous from in-memory cache (`_cache`). IndexedDB syncs in background.
- Material library is a read-only JSON catalog. Picked materials are per-job arrays.
- No user accounts or cloud sync yet — single-user, single-device.
- IDs are passed through onclick handlers, never raw strings (special character safety).

## Key Files
- `app.js` — entire application (~2100 lines, single file)
- `index.html` — shell + all CSS
- `sw.js` — service worker (cache version must bump on every deploy)
- `rough_materials.json` — rough-in material catalog (88 items)
- `trim_materials.json` — trim-out material catalog (120+ items, variants, part refs)
- `manifest.json` — PWA manifest
- `serve.js` — dev server

## Current Features (v0.6)
- Ticket CRUD with status tracking, date, tech assignment
- Daily/Weekly views with local timezone handling
- Address database with property intelligence fields
- Material picker with search, inline qty input, +/- steppers with long-press
- Frequent flyers (top 10 most-used materials auto-surfaced)
- "Previously at this address" (materials from prior jobs at same property)
- Bulk templates (rough-in starter, trim-out starter)
- Trim material variants (Toggle/Decora, breaker brands) with part ref tracking
- Address-level material rollup (the strategic moat — no competitor does this)
- Photo/video/drawing attachments stored in IndexedDB
- Vector board (priority ticket staging)
- Full-text search across all tickets
- Google Maps navigation integration
- Export/import data as JSON backup

## Strategic Context
- Address-level material rollup is the core differentiator. Every material added to a ticket becomes property intelligence data.
- Phase 1 roadmap: invoicing (Stripe), CRM, estimates, calendar, multi-user, QuickBooks integration, cloud sync (Supabase).
- Target market: solo electricians and small crews (1-5 people), 60-70% of whom use zero FSM software today.

## Communication Style
Warhammer 40K Space Marine. We purge bugs and fortify the codebase in the Emperor's name.
