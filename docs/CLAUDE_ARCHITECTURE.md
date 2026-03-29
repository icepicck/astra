# CLAUDE_ARCHITECTURE — Profile 2–3 Cheat Sheet
*Load for: cross-module bugs, data flow changes, cache layer issues, integration work.*
*Token budget: ~3,000–6,000. Load with relevant module source files.*
*Required for any task escalated from Profile 1 that touches app.js logic, cache reads, or IDB patterns.*

---

## SYSTEM ARCHITECTURE OVERVIEW

**Data layer:**
- IndexedDB astra_db (version 4): jobs, techs, addresses, estimates, _config, _syncMeta
- IndexedDB astra_media (version 1): blobs (photos, drawings, videos)
- localStorage: settings only (gmaps key, home base, supabase URL/key, last sync, nav frequency)
- In-memory _cache: synchronous read layer. All UI reads from _cache. IDB is write-through.

**Module communication:**
- app.js → sets window.Astra namespace (core data/nav CRUD)
- astra-estimates.js → reads window.Astra, exposes estimator + intelligence functions
- astra-materials.js → reads window.Astra, exposes catalog + picker functions
- astra-maps.js → reads window.Astra, exposes Google Maps + Vector routing
- astra-sync.js → reads window.Astra, handles Supabase push/pull/realtime
- astra-auth.js → reads window.Astra, handles Supabase Auth + session management
- Each module is an IIFE. No circular dependencies. Public API exposed on window.

**Boot sequence:**
initDataLayer() → autoLoadBuiltInLibraries() → openMediaDB() → migrateLegacyMedia()
→ checkAuth() → [if authenticated] renderJobList() + cleanOrphanedMedia() + startupDrain()

**Service worker (sw.js):**
- Cache-first for same-origin (app shell assets)
- Network-first with 3s timeout for external (Google Maps, Supabase)
- Version-bumped (CACHE_NAME = 'astra-v63')
- Update: silent reload when idle, orange banner when busy

**Key invariant:** Local state is truth. Network failure = sync delay, not outage.

**File sizes (current):**
- index.html: 64K (HTML + CSS, no JS)
- app.js: 93K (~2,200 lines)
- astra-estimates.js: 63K (~1,460 lines)
- astra-materials.js: 28K (~620 lines)
- astra-maps.js: 14K (~200 lines)
- astra-sync.js: 26K (~700 lines)
- astra-auth.js: 19K (~520 lines)
