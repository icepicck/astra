# CLAUDE_AUTH — Profile 2 Cheat Sheet
*Load for: auth flow changes, login/logout, session handling, user management, invite flow.*
*Token budget: ~2,000–4,000. Load with astra-auth.js source.*
*SECURITY TRIPWIRE: Any change to auth flow, token storage, session handling, or RLS policies. See ASTRA_CONTEXT_STRATEGY.md.*

---

## AUTHENTICATION MODULE RULES

**Boot sequence:** initDataLayer() → autoLoadBuiltInLibraries() → openMediaDB() → migrateLegacyMedia() → checkAuth() → [if authenticated] renderJobList() + cleanOrphanedMedia() + startupDrain() | [if not] showLogin()

**Key Patterns Already Implemented (DO NOT REINVENT):**
- checkAuth() → checks Supabase session, falls back to IDB cached user for offline
- _loadUserProfile(authUserId) → fetches from Supabase 'users' table
- _saveCachedUser(user) / _clearCachedUser() → IDB _config store persistence
- login(email, password) → signInWithPassword → loadProfile → rebuildFromCloud → navigate to jobs
- signup(email, password, name, accountName) → creates auth user + account + user profile
- logout() → clears cached user, clears cache, clears IDB stores, stops realtime, signs out
- inviteTech(email, name) → creates 'invited' row in users table for later signup linking
- _rebuildFromCloud() → full pull after login to populate local data from account's cloud data
- DEFAULT_ACCOUNT_ID → first signup claims it, subsequent signups create new accounts

**DO NOT:**
- Store credentials, tokens, or session data in any cheat sheet or instruction document.
- Trust cached user data for authorization decisions on cloud writes (RLS enforces server-side).
- Modify the logout → clearCache → clearAllStores sequence (prevents data bleed between accounts).
- Allow any auth state change without stopping and restarting realtime subscriptions.

**Standing order from Robert:** Step 4 Auth is verified and complete. Real customer data is now permissible with auth active. All writes must go through authenticated sessions with RLS enforcement.

**Verification:**
- Login → data loads from cloud → app functions normally.
- Logout → all local data cleared → login screen shown → no data from previous session visible.
- Offline with cached session → app functions with cached data.
- Different account login → zero data bleed from previous account.
