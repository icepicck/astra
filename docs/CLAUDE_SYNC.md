# CLAUDE_SYNC — Profile 2 Cheat Sheet
*Load for: sync bugs, push/pull changes, realtime handler work, offline behavior, retry queue.*
*Token budget: ~2,000–4,000. Load with astra-sync.js source.*
*SECURITY TRIPWIRE: Changes to sync patterns, cloud writes, or Supabase client usage. See ASTRA_CONTEXT_STRATEGY.md.*

---

## SYNC & OFFLINE MODULE RULES

**Core invariant:** Local state is ALWAYS canonical. IndexedDB is source of truth. Supabase is cloud backup. App must function with zero network indefinitely. Sync is background convenience. Network failure = sync delay, not outage.

**Key Patterns Already Implemented (DO NOT REINVENT):**
- _markDirty() → sets IDB _syncMeta flag + triggers _debouncedAutoSync (3s debounce)
- _runAutoSync() → guards: dirty, online, configured, not already syncing. Exponential backoff on failure (5s → 60s cap).
- _clearDirty() → clears IDB flag on successful sync
- _startupDrain() → checks for dirty flag from previous session on boot, auto-syncs after 5s delay
- _filterByTimestamp(records, cloudTimes, field) → compares local updated_at vs cloud, skips if cloud is newer
- _ensureMaterialIds(jobs) → backfills missing UUIDs on materials before push
- batchUpsert(table, records, conflictCol) → chunks of 500, onConflict resolution
- _getCloudTimestamps(table) → fetches all cloud id + updated_at for comparison
- startRealtime() → subscribes channel to jobs, addresses, techs, estimates on postgres_changes
- _handleRemoteChange(table, payload) → local-wins timestamp check, updates cache + IDB
- _updateSyncIndicator(state) → ambient dot: synced/pending/syncing/offline/hidden
- Online/offline listeners → auto-trigger sync on reconnection after 2s stabilization delay
- Supabase client singleton: window._astraSupabaseClient (auth module owns creation, sync borrows)

**Field mapping convention:**
- Local: camelCase (jobType, techNotes, addressId)
- Cloud/Postgres: snake_case (job_type, tech_notes, address_id)
- Every entity has a toCloud() and fromCloud() mapper function
- account_id is injected via _acctId() on every cloud write

**DO NOT:**
- Convert var → const/let inside IIFEs (compatibility pattern, intentional).
- Convert function declarations → arrow functions in IIFEs (hoisting + this binding).
- Add async/await to _idbPut (IDB transaction timing is sensitive to microtask ordering).
- Change the push order: addresses → techs → jobs → materials → estimates (FK dependencies).
- Remove the _syncCooldown window (prevents realtime echo after push).
- Create a second Supabase client — always use window._astraSupabaseClient.

**Known gaps (documented, not yet fixed):**
- _handleRemoteChange has no handler for 'materials' table events (P0 — fix before multi-user)
- Tech pull mutates _cache.techs directly without IDB write-through (P0 — fix before multi-user)
- Pull does select('*') on all tables — no incremental sync yet (P1 — fix before 500+ jobs)
- Pull doesn't handle cloud-side deletions (P1 — need soft delete strategy for multi-user)
- addrFromCloud() doesn't preserve createdAt (moderate)
- savePricebook() dual-writes to IDB and localStorage (safe to remove localStorage write — Step 3 migration confirmed complete)

**Verification:**
- Does the app still function in airplane mode after your change?
- Does auto-sync trigger within 3 seconds of a data write (when online)?
- Does the dirty flag persist across app restart?
- Is timestamp protection preserved (local-wins when local is newer)?
