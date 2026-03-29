// ═══════════════════════════════════════════
// ASTRA — AUTHENTICATION MODULE
// Step 4: The Gate
// ═══════════════════════════════════════════
(function () {
  'use strict';

  var A = window.Astra;
  var DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';

  // ── Hardcoded defaults — survives cache clear ──
  // Anon key is public by design. RLS is the real security.
  var DEFAULT_SUPA_URL = 'https://uyjpvjdpdyckkkxrfpsl.supabase.co'; // ← PASTE YOUR SUPABASE PROJECT URL HERE (e.g. https://xxxxx.supabase.co)
  var DEFAULT_SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5anB2amRwZHlja2treHJmcHNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0ODIwNzQsImV4cCI6MjA5MDA1ODA3NH0.xFSPy7Qdmg4TQVuj-loMFjv5jQ2JSdxufbfGJHeSvZY'; // ← PASTE YOUR SUPABASE ANON KEY HERE

  // ── Supabase Client (shared singleton) ──
  // Created eagerly so auth can be checked before sync
  var _client = null;

  function _getClient() {
    if (_client) return _client;
    if (window._astraSupabaseClient) {
      _client = window._astraSupabaseClient;
      return _client;
    }
    var url = localStorage.getItem('astra_supabase_url') || DEFAULT_SUPA_URL;
    var key = localStorage.getItem('astra_supabase_key') || DEFAULT_SUPA_KEY;
    if (!url || !key || !window.supabase || !window.supabase.createClient) return null;
    _client = window.supabase.createClient(url, key);
    window._astraSupabaseClient = _client;
    return _client;
  }

  // ── Current User (in-memory, loaded from IDB on boot) ──
  var _currentUser = null;

  function getCurrentUser() { return _currentUser; }
  function getAccountId() { return _currentUser ? _currentUser.accountId : null; }

  // ── Load/save user profile to IDB _config store ──
  function _loadCachedUser() {
    if (!A._idbConfigGet) return Promise.resolve(null);
    return A._idbConfigGet('currentUser');
  }

  function _saveCachedUser(user) {
    if (!A._idbConfigPut) return;
    A._idbConfigPut('currentUser', user);
  }

  function _clearCachedUser() {
    _currentUser = null;
    if (A._idbConfigPut) A._idbConfigPut('currentUser', null);
  }

  // ═══════════════════════════════════════════
  // CHECK AUTH — The Boot Gate
  // Returns true if authenticated, false if login needed
  // ═══════════════════════════════════════════

  function checkAuth() {
    return new Promise(function (resolve) {
      var sb = _getClient();
      if (!sb) {
        // Supabase not configured — check for cached user (offline)
        _loadCachedUser().then(function (cached) {
          if (cached) {
            _currentUser = cached;
            resolve(true);
          } else {
            _showLogin();
            resolve(false);
          }
        });
        return;
      }

      sb.auth.getSession().then(function (result) {
        var session = result.data && result.data.session;
        if (session && session.user) {
          // Valid session — load user profile
          _loadUserProfile(session.user.id).then(function (user) {
            if (user) {
              _currentUser = user;
              _saveCachedUser(user);
              resolve(true);
            } else {
              // Auth session exists but no user profile — might need to complete signup
              _loadCachedUser().then(function (cached) {
                if (cached) {
                  _currentUser = cached;
                  resolve(true);
                } else {
                  _showLogin();
                  resolve(false);
                }
              });
            }
          });
        } else {
          // No session — check IDB for cached user (offline mode)
          _loadCachedUser().then(function (cached) {
            if (cached) {
              _currentUser = cached;
              resolve(true);
            } else {
              _showLogin();
              resolve(false);
            }
          });
        }
      }).catch(function () {
        // Network error — try cached user
        _loadCachedUser().then(function (cached) {
          if (cached) {
            _currentUser = cached;
            resolve(true);
          } else {
            _showLogin();
            resolve(false);
          }
        });
      });
    });
  }

  // ── Fetch user profile from Supabase users table ──
  function _loadUserProfile(authUserId) {
    var sb = _getClient();
    if (!sb) return Promise.resolve(null);
    return sb.from('users').select('*').eq('id', authUserId).single()
      .then(function (result) {
        if (result.error || !result.data) return null;
        return {
          id: result.data.id,
          accountId: result.data.account_id,
          name: result.data.name,
          email: result.data.email,
          role: result.data.role,
          status: result.data.status
        };
      })
      .catch(function () { return null; });
  }

  // ═══════════════════════════════════════════
  // LOGIN
  // ═══════════════════════════════════════════

  function login(email, password) {
    var sb = _getClient();
    if (!sb) {
      _showLoginError('SUPABASE NOT CONFIGURED');
      return Promise.resolve(false);
    }

    _setLoginLoading(true);

    return sb.auth.signInWithPassword({ email: email, password: password })
      .then(function (result) {
        if (result.error) {
          _showLoginError(result.error.message);
          _setLoginLoading(false);
          return false;
        }

        var user = result.data.user;
        return _loadUserProfile(user.id).then(function (profile) {
          if (!profile) {
            _showLoginError('NO USER PROFILE FOUND. CONTACT YOUR SUPERVISOR.');
            _setLoginLoading(false);
            return false;
          }

          _currentUser = profile;
          _saveCachedUser(profile);

          // Rebuild local data from cloud
          return _rebuildFromCloud().then(function () {
            _setLoginLoading(false);
            A.goTo('screen-jobs');
            return true;
          });
        });
      })
      .catch(function (e) {
        _showLoginError(e.message || 'LOGIN FAILED');
        _setLoginLoading(false);
        return false;
      });
  }

  // ═══════════════════════════════════════════
  // SIGNUP — Admin first-time setup
  // ═══════════════════════════════════════════

  function signup(email, password, name, accountName) {
    var sb = _getClient();
    if (!sb) {
      _showLoginError('SUPABASE NOT CONFIGURED');
      return Promise.resolve(false);
    }

    _setLoginLoading(true);

    return sb.auth.signUp({ email: email, password: password })
      .then(function (result) {
        if (result.error) {
          _showLoginError(result.error.message);
          _setLoginLoading(false);
          return false;
        }

        var authUser = result.data.user;
        if (!authUser) {
          _showLoginError('SIGNUP FAILED — NO USER RETURNED');
          _setLoginLoading(false);
          return false;
        }

        // Check if there's an invited user row for this email
        return sb.from('users').select('*').eq('email', email).eq('status', 'invited').single()
          .then(function (inviteResult) {
            if (inviteResult.data) {
              // Invited tech — link to existing row
              return sb.from('users').update({
                id: authUser.id,
                status: 'active'
              }).eq('email', email).eq('status', 'invited')
                .then(function () {
                  return _loadUserProfile(authUser.id);
                });
            } else {
              // New admin signup — use default account or create one
              var accountId = DEFAULT_ACCOUNT_ID;
              if (accountName) {
                // Update default account name
                return sb.from('accounts').update({ name: accountName })
                  .eq('id', DEFAULT_ACCOUNT_ID)
                  .then(function () {
                    // Create user row
                    return sb.from('users').insert({
                      id: authUser.id,
                      account_id: accountId,
                      name: name || '',
                      email: email,
                      role: 'admin',
                      status: 'active'
                    });
                  })
                  .then(function (insertResult) {
                    if (insertResult.error) {
                      _showLoginError('USER CREATION FAILED: ' + insertResult.error.message);
                      return null;
                    }
                    return {
                      id: authUser.id,
                      accountId: accountId,
                      name: name || '',
                      email: email,
                      role: 'admin',
                      status: 'active'
                    };
                  });
              } else {
                // Create user row with default account
                return sb.from('users').insert({
                  id: authUser.id,
                  account_id: accountId,
                  name: name || '',
                  email: email,
                  role: 'admin',
                  status: 'active'
                }).then(function (insertResult) {
                  if (insertResult.error) {
                    _showLoginError('USER CREATION FAILED: ' + insertResult.error.message);
                    return null;
                  }
                  return {
                    id: authUser.id,
                    accountId: accountId,
                    name: name || '',
                    email: email,
                    role: 'admin',
                    status: 'active'
                  };
                });
              }
            }
          })
          .then(function (profile) {
            if (!profile) {
              _setLoginLoading(false);
              return false;
            }

            _currentUser = profile;
            _saveCachedUser(profile);

            _setLoginLoading(false);

            // Auto-login after signup (Supabase auto-confirms in dev mode)
            A.goTo('screen-jobs');
            if (A.showToast) A.showToast('WELCOME TO ASTRA');
            return true;
          });
      })
      .catch(function (e) {
        _showLoginError(e.message || 'SIGNUP FAILED');
        _setLoginLoading(false);
        return false;
      });
  }

  // ═══════════════════════════════════════════
  // LOGOUT
  // ═══════════════════════════════════════════

  function logout() {
    var sb = _getClient();

    // Clear user state
    _clearCachedUser();

    // Clear in-memory cache
    if (A._clearCache) A._clearCache();

    // Clear IDB data stores
    if (A._clearAllStores) A._clearAllStores();

    // Stop realtime
    if (window.stopRealtime) window.stopRealtime();

    // Sign out from Supabase
    if (sb) {
      sb.auth.signOut().catch(function () { });
    }

    // Navigate to login
    _showLogin();

    if (A.showToast) A.showToast('SIGNED OUT');
  }

  // ═══════════════════════════════════════════
  // INVITE TECH
  // ═══════════════════════════════════════════

  function inviteTech(email, name) {
    if (!_currentUser || (_currentUser.role !== 'admin' && _currentUser.role !== 'supervisor')) {
      if (A.showToast) A.showToast('ONLY ADMINS CAN INVITE', 'error');
      return Promise.resolve(false);
    }

    var sb = _getClient();
    if (!sb) return Promise.resolve(false);

    return sb.from('users').insert({
      id: crypto.randomUUID(), // placeholder — will be replaced on signup
      account_id: _currentUser.accountId,
      name: name || '',
      email: email,
      role: 'tech',
      status: 'invited'
    }).then(function (result) {
      if (result.error) {
        if (A.showToast) A.showToast('INVITE FAILED: ' + result.error.message, 'error');
        return false;
      }
      if (A.showToast) A.showToast('INVITED: ' + email);
      return true;
    });
  }

  // ═══════════════════════════════════════════
  // AUTH STATE CHANGE LISTENER
  // ═══════════════════════════════════════════

  function _setupAuthListener() {
    var sb = _getClient();
    if (!sb) return;

    sb.auth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_OUT') {
        _clearCachedUser();
        if (A._clearCache) A._clearCache();
        _showLogin();
      } else if (event === 'TOKEN_REFRESHED') {
        // Token refreshed silently — no action needed
        console.log('[ASTRA AUTH] Token refreshed');
      }
    });
  }

  // ═══════════════════════════════════════════
  // UI HELPERS
  // ═══════════════════════════════════════════

  function _showLogin() {
    // Hide all screens, show login
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.remove('active');
    }
    var loginScreen = document.getElementById('screen-login');
    if (loginScreen) loginScreen.classList.add('active');

    // Hide global nav on login screen
    var nav = document.getElementById('global-nav');
    if (nav) nav.style.display = 'none';
  }

  function _showLoginError(msg) {
    var el = document.getElementById('login-error');
    if (el) {
      el.textContent = msg.toUpperCase();
      el.style.display = 'block';
    }
  }

  function _setLoginLoading(loading) {
    var btn = document.getElementById('login-btn');
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? 'SIGNING IN...' : 'SIGN IN';
    }
    var signupBtn = document.getElementById('signup-btn');
    if (signupBtn) {
      signupBtn.disabled = loading;
      signupBtn.textContent = loading ? 'SETTING UP...' : 'CREATE ACCOUNT';
    }
  }

  // ── Rebuild local data from cloud after login ──
  function _rebuildFromCloud() {
    if (!window.syncFromCloud) return Promise.resolve();
    return window.syncFromCloud(function () { }).catch(function (e) {
      console.warn('[ASTRA AUTH] Post-login sync failed:', e.message);
      // Non-fatal — user can still work with local data
    });
  }

  // ═══════════════════════════════════════════
  // HTML ONCLICK HANDLERS
  // ═══════════════════════════════════════════

  function doLogin() {
    var email = (document.getElementById('login-email') || {}).value || '';
    var password = (document.getElementById('login-password') || {}).value || '';
    if (!email || !password) {
      _showLoginError('ENTER EMAIL AND PASSWORD');
      return;
    }
    login(email.trim(), password);
  }

  function doSignup() {
    var email = (document.getElementById('signup-email') || {}).value || '';
    var password = (document.getElementById('signup-password') || {}).value || '';
    var name = (document.getElementById('signup-name') || {}).value || '';
    var accountName = (document.getElementById('signup-account') || {}).value || '';
    if (!email || !password) {
      _showLoginError('ENTER EMAIL AND PASSWORD');
      return;
    }
    if (password.length < 6) {
      _showLoginError('PASSWORD MUST BE AT LEAST 6 CHARACTERS');
      return;
    }
    signup(email.trim(), password, name.trim(), accountName.trim());
  }

  function showSignupForm() {
    var loginForm = document.getElementById('login-form');
    var signupForm = document.getElementById('signup-form');
    if (loginForm) loginForm.style.display = 'none';
    if (signupForm) signupForm.style.display = 'block';
    // Clear error
    var el = document.getElementById('login-error');
    if (el) el.style.display = 'none';
  }

  function showLoginForm() {
    var loginForm = document.getElementById('login-form');
    var signupForm = document.getElementById('signup-form');
    if (loginForm) loginForm.style.display = 'block';
    if (signupForm) signupForm.style.display = 'none';
    var el = document.getElementById('login-error');
    if (el) el.style.display = 'none';
  }

  function doLogout() {
    if (confirm('SIGN OUT OF ASTRA?')) {
      logout();
    }
  }

  // ═══════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════

  _setupAuthListener();

  // ── Public API ──
  Object.assign(A, {
    checkAuth: checkAuth,
    login: login,
    signup: signup,
    logout: logout,
    getCurrentUser: getCurrentUser,
    getAccountId: getAccountId,
    inviteTech: inviteTech,
    _idbConfigGet: A._idbConfigGet,
    _idbConfigPut: A._idbConfigPut
  });

  Object.assign(window, {
    doLogin: doLogin,
    doSignup: doSignup,
    doLogout: doLogout,
    showSignupForm: showSignupForm,
    showLoginForm: showLoginForm
  });

})();
