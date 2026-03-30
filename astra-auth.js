// ═══════════════════════════════════════════
// ASTRA — AUTHENTICATION MODULE
// Step 4: The Gate
// ═══════════════════════════════════════════
(function () {
  'use strict';

  var A = window.Astra;
  var DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
  var OFFLINE_SESSION_MAX_DAYS = 7; // SEC-003: Max days a cached session can survive without server validation

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

  function _saveCachedUser(user, serverValidated) {
    if (!A._idbConfigPut) return;
    if (serverValidated) user._lastServerValidation = new Date().toISOString();
    A._idbConfigPut('currentUser', user);
  }

  function _clearCachedUser() {
    _currentUser = null;
    if (A._idbConfigPut) A._idbConfigPut('currentUser', null);
  }

  // E2: Offline session expiry check (SEC-003)
  function _isSessionExpired(cached) {
    if (!cached || !cached._lastServerValidation) return true; // No timestamp = never validated = expired
    var validated = new Date(cached._lastServerValidation).getTime();
    var now = Date.now();
    var maxAge = OFFLINE_SESSION_MAX_DAYS * 24 * 60 * 60 * 1000;
    return (now - validated) > maxAge;
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
          if (cached && !_isSessionExpired(cached)) {
            _currentUser = cached;
            resolve(true);
          } else {
            if (cached) _clearCachedUser(); // E2: expired — wipe stale session
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
              _saveCachedUser(user, true); // E2: server-validated — stamp it
              resolve(true);
            } else {
              // Auth session exists but no user profile — might need to complete signup
              _loadCachedUser().then(function (cached) {
                if (cached && !_isSessionExpired(cached)) {
                  _currentUser = cached;
                  resolve(true);
                } else {
                  if (cached) _clearCachedUser();
                  _showLogin();
                  resolve(false);
                }
              });
            }
          });
        } else {
          // No session — check IDB for cached user (offline mode)
          _loadCachedUser().then(function (cached) {
            if (cached && !_isSessionExpired(cached)) {
              _currentUser = cached;
              resolve(true);
            } else {
              if (cached) _clearCachedUser();
              _showLogin();
              resolve(false);
            }
          });
        }
      }).catch(function () {
        // Network error — try cached user
        _loadCachedUser().then(function (cached) {
          if (cached && !_isSessionExpired(cached)) {
            _currentUser = cached;
            resolve(true);
          } else {
            if (cached) _clearCachedUser();
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

  // Step 7E: Extracted profile load + app entry (used after password and after MFA verify)
  function _completeLogin(authUserId) {
    return _loadUserProfile(authUserId).then(function(profile) {
      if (!profile) {
        _showLoginError('NO USER PROFILE FOUND. CONTACT YOUR SUPERVISOR.');
        _setLoginLoading(false);
        return false;
      }
      _currentUser = profile;
      _loginAttempts = 0; // T2-B1: Reset on success
      _saveCachedUser(profile, true); // E2c: login is server-validated
      return _rebuildFromCloud().then(function() {
        _setLoginLoading(false);
        A.goTo('screen-jobs');
        return true;
      });
    });
  }

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

        // Step 7E: Check if MFA is required (user has TOTP enrolled)
        return sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function(aalResult) {
          if (aalResult.data && aalResult.data.nextLevel === 'aal2' && aalResult.data.currentLevel === 'aal1') {
            // MFA required — show challenge screen
            return sb.auth.mfa.listFactors().then(function(factorsResult) {
              if (factorsResult.error || !factorsResult.data) {
                _showLoginError('MFA ERROR');
                _setLoginLoading(false);
                return false;
              }
              var totpFactors = (factorsResult.data.totp || []).filter(function(f) { return f.status === 'verified'; });
              if (!totpFactors.length) {
                // No verified factors — proceed without MFA (shouldn't happen but be safe)
                return _completeLogin(user.id);
              }
              var factorId = totpFactors[0].id;
              return sb.auth.mfa.challenge({ factorId: factorId }).then(function(challengeResult) {
                if (challengeResult.error) {
                  _showLoginError('MFA CHALLENGE FAILED');
                  _setLoginLoading(false);
                  return false;
                }
                _setLoginLoading(false);
                _showMfaChallenge(factorId, challengeResult.data.id, function() {
                  _completeLogin(user.id);
                });
                return 'mfa_pending';
              });
            });
          }
          // No MFA required — proceed with login
          return _completeLogin(user.id);
        });
      })
      .catch(function (e) {
        // T2-B1: Surface Supabase rate limit errors clearly
        var msg = (e.message || 'LOGIN FAILED');
        if (e.status === 429 || msg.indexOf('rate') !== -1 || msg.indexOf('429') !== -1) {
          msg = 'TOO MANY ATTEMPTS — WAIT A FEW MINUTES';
        }
        _showLoginError(msg);
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
              // Invited tech — link to existing row (E3: with retry)
              return sb.from('users').update({
                id: authUser.id,
                status: 'active'
              }).eq('email', email).eq('status', 'invited')
                .then(function (updateResult) {
                  if (updateResult.error) {
                    // E3: Retry once after 1s — RLS race on invited row
                    console.warn('[ASTRA AUTH] Invited-tech update failed, retrying...', updateResult.error.message);
                    return new Promise(function (r) { setTimeout(r, 1000); })
                      .then(function () {
                        return sb.from('users').update({ id: authUser.id, status: 'active' })
                          .eq('email', email).eq('status', 'invited');
                      })
                      .then(function (retry) {
                        if (retry.error) {
                          console.error('[ASTRA AUTH] Invited-tech retry failed:', retry.error.message);
                          if (A.showToast) A.showToast('PROFILE LINK FAILED — LOG OUT AND BACK IN', 'error');
                        }
                        return _loadUserProfile(authUser.id);
                      });
                  }
                  return _loadUserProfile(authUser.id);
                });
            } else {
              // New admin signup — check if default account is already claimed
              return sb.from('users').select('id').eq('account_id', DEFAULT_ACCOUNT_ID).limit(1)
                .then(function (checkResult) {
                  var defaultClaimed = checkResult.data && checkResult.data.length > 0;

                  if (defaultClaimed) {
                    // Default account taken — create a new account for this shop
                    return sb.from('accounts').insert({ name: accountName || '' })
                      .select('id').single()
                      .then(function (newAcct) {
                        if (newAcct.error) {
                          _showLoginError('ACCOUNT CREATION FAILED: ' + newAcct.error.message);
                          return null;
                        }
                        return newAcct.data.id;
                      });
                  } else {
                    // First signup — claim default account
                    if (accountName) {
                      return sb.from('accounts').update({ name: accountName })
                        .eq('id', DEFAULT_ACCOUNT_ID)
                        .then(function () { return DEFAULT_ACCOUNT_ID; });
                    }
                    return Promise.resolve(DEFAULT_ACCOUNT_ID);
                  }
                })
                .then(function (accountId) {
                  if (!accountId) return null;
                  var userRow = {
                    id: authUser.id,
                    account_id: accountId,
                    name: name || '',
                    email: email,
                    role: 'admin',
                    status: 'active'
                  };
                  var profileStub = {
                    id: authUser.id,
                    accountId: accountId,
                    name: name || '',
                    email: email,
                    role: 'admin',
                    status: 'active'
                  };
                  return sb.from('users').insert(userRow).then(function (insertResult) {
                    if (insertResult.error) {
                      // E3: Retry once after 1s — RLS propagation race
                      console.warn('[ASTRA AUTH] User insert failed, retrying...', insertResult.error.message);
                      return new Promise(function (r) { setTimeout(r, 1000); })
                        .then(function () { return sb.from('users').insert(userRow); })
                        .then(function (retry) {
                          if (retry.error) {
                            console.error('[ASTRA AUTH] User insert retry failed:', retry.error.message);
                            if (A.showToast) A.showToast('PROFILE SAVE FAILED — LOG OUT AND BACK IN', 'error');
                            // Return stub so app doesn't brick — profile will sync on next login
                            return profileStub;
                          }
                          return profileStub;
                        });
                    }
                    return profileStub;
                  });
                });
            }
          })
          .then(function (profile) {
            if (!profile) {
              _setLoginLoading(false);
              return false;
            }

            _currentUser = profile;
            _saveCachedUser(profile, true); // E2c: signup is server-validated

            _setLoginLoading(false);

            // D29: After signup, show onboarding if no jobs exist (first-time user)
            if (A.loadJobs().length === 0) {
              A.goTo('screen-onboarding');
            } else {
              A.goTo('screen-jobs');
            }
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
        // E2c: Token refresh proves server connectivity — re-stamp cached user
        if (_currentUser) _saveCachedUser(_currentUser, true);
        console.log('[ASTRA AUTH] Token refreshed — session validation renewed');
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

  // T2-B1 (SEC-001): Client-side login rate limiting
  var _loginAttempts = 0;
  var _loginCooldownUntil = 0;

  function doLogin() {
    // Rate limit check
    if (Date.now() < _loginCooldownUntil) {
      var secsLeft = Math.ceil((_loginCooldownUntil - Date.now()) / 1000);
      _showLoginError('TOO MANY ATTEMPTS. WAIT ' + secsLeft + ' SECONDS.');
      return;
    }
    var email = (document.getElementById('login-email') || {}).value || '';
    var password = (document.getElementById('login-password') || {}).value || '';
    if (!email || !password) {
      _showLoginError('ENTER EMAIL AND PASSWORD');
      return;
    }
    _loginAttempts++;
    if (_loginAttempts >= 5) {
      _loginCooldownUntil = Date.now() + 60000; // 1 minute cooldown
      _loginAttempts = 0;
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
    showConfirmModal('SIGN OUT', 'SIGN OUT OF ASTRA?', 'SIGN OUT', function() {
      logout();
    }, { destructive: true });
  }

  // ═══════════════════════════════════════════
  // STEP 7E: 2FA / TOTP (Supabase MFA)
  // ═══════════════════════════════════════════

  // Pending MFA state used during login challenge flow
  var _mfaPending = null; // { factorId, challengeId, onSuccess }

  // Check if current user has MFA enrolled (any verified TOTP factor)
  async function isMfaEnabled() {
    var sb = _getClient();
    if (!sb) return false;
    try {
      var result = await sb.auth.mfa.listFactors();
      if (result.error || !result.data) return false;
      var totp = (result.data.totp || []).filter(function(f) { return f.factor_type === 'totp' && f.status === 'verified'; });
      return totp.length > 0;
    } catch (e) { return false; }
  }

  // Start MFA enrollment — shows QR code setup screen
  async function enrollMfa() {
    var sb = _getClient();
    if (!sb) { A.showToast('NOT CONNECTED', 'error'); return; }
    try {
      var result = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'ASTRA' });
      if (result.error) { A.showToast('ENROLLMENT FAILED: ' + result.error.message, 'error'); return; }
      var factor = result.data;
      // Show QR code and secret on setup screen
      var qrContainer = document.getElementById('mfa-qr-container');
      if (qrContainer) qrContainer.innerHTML = '<img src="' + factor.totp.qr_code + '" alt="QR CODE">';
      var secretDisplay = document.getElementById('mfa-secret-display');
      if (secretDisplay) secretDisplay.textContent = factor.totp.secret;
      var codeInput = document.getElementById('mfa-setup-code');
      if (codeInput) codeInput.value = '';
      var errorEl = document.getElementById('mfa-setup-error');
      if (errorEl) errorEl.textContent = '';
      // Store factor ID for verification step
      _mfaPending = { factorId: factor.id };
      A.goTo('screen-2fa-setup');
    } catch (e) {
      A.showToast('ENROLLMENT ERROR: ' + e.message, 'error');
    }
  }

  // Complete MFA enrollment — verify the first code to confirm setup
  async function doMfaEnrollVerify() {
    var sb = _getClient();
    if (!sb || !_mfaPending) return;
    var codeInput = document.getElementById('mfa-setup-code');
    var code = codeInput ? codeInput.value.trim() : '';
    var errorEl = document.getElementById('mfa-setup-error');
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      if (errorEl) errorEl.textContent = 'ENTER A 6-DIGIT CODE';
      return;
    }
    try {
      // Challenge then verify to confirm enrollment
      var challengeResult = await sb.auth.mfa.challenge({ factorId: _mfaPending.factorId });
      if (challengeResult.error) {
        if (errorEl) errorEl.textContent = 'CHALLENGE FAILED: ' + challengeResult.error.message;
        return;
      }
      var verifyResult = await sb.auth.mfa.verify({
        factorId: _mfaPending.factorId,
        challengeId: challengeResult.data.id,
        code: code
      });
      if (verifyResult.error) {
        if (errorEl) errorEl.textContent = 'INVALID CODE — TRY AGAIN';
        if (codeInput) codeInput.value = '';
        return;
      }
      // Success — MFA is now enrolled and verified
      _mfaPending = null;
      A.showToast('2FA ENABLED', 'success');
      A.goTo('screen-settings');
    } catch (e) {
      if (errorEl) errorEl.textContent = 'ERROR: ' + e.message;
    }
  }

  // Disable MFA — unenroll all TOTP factors
  async function unenrollMfa() {
    var sb = _getClient();
    if (!sb) return;
    try {
      var result = await sb.auth.mfa.listFactors();
      if (result.error || !result.data) return;
      var totp = result.data.totp || [];
      for (var i = 0; i < totp.length; i++) {
        await sb.auth.mfa.unenroll({ factorId: totp[i].id });
      }
      A.showToast('2FA DISABLED');
      // Refresh settings UI if visible
      if (window.renderSettings) window.renderSettings();
    } catch (e) {
      A.showToast('DISABLE FAILED: ' + e.message, 'error');
    }
  }

  // T2-B3 (SEC-009): Password verification modal for sensitive actions
  function _showPasswordVerifyModal(callback) {
    var title = document.getElementById('modal-title');
    var msg = document.getElementById('modal-message');
    var actions = document.getElementById('modal-actions');
    if (!title || !msg || !actions) return;
    title.textContent = 'VERIFY PASSWORD';
    msg.innerHTML = '<input type="password" id="verify-password" placeholder="ENTER YOUR PASSWORD" '
      + 'style="width:100%;min-height:48px;padding:12px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#e0e0e0;font-size:15px;font-family:inherit;box-sizing:border-box;margin-top:8px;" />';
    actions.innerHTML = '<button class="modal-btn modal-btn-confirm" onclick="_verifyPasswordConfirm()">VERIFY</button>'
      + '<button class="modal-btn modal-btn-cancel" onclick="_closeModal()">CANCEL</button>';
    window._verifyPasswordCallback = callback;
    document.getElementById('modal-backdrop').classList.add('active');
    document.getElementById('modal-sheet').classList.add('active');
    setTimeout(function() { var el = document.getElementById('verify-password'); if (el) el.focus(); }, 200);
  }

  function _verifyPasswordConfirm() {
    var pw = (document.getElementById('verify-password') || {}).value || '';
    if (!pw) return;
    var sb = _getClient();
    var email = _currentUser ? _currentUser.email : '';
    if (!sb || !email) { _closeModal(); return; }
    sb.auth.signInWithPassword({ email: email, password: pw }).then(function(result) {
      _closeModal();
      if (result.error) {
        if (A.showToast) A.showToast('INCORRECT PASSWORD', 'error');
        return;
      }
      if (window._verifyPasswordCallback) window._verifyPasswordCallback();
    });
  }

  // Toggle MFA from settings button
  function toggleMfa() {
    isMfaEnabled().then(function(enabled) {
      if (enabled) {
        // SEC-009: Require password verification before disabling 2FA
        _showPasswordVerifyModal(function() {
          showConfirmModal('DISABLE 2FA', 'REMOVE TWO-FACTOR AUTHENTICATION?', 'DISABLE', function() {
            unenrollMfa();
          }, { destructive: true });
        });
      } else {
        enrollMfa();
      }
    });
  }

  // Show MFA challenge screen during login flow
  function _showMfaChallenge(factorId, challengeId, onSuccess) {
    _mfaPending = { factorId: factorId, challengeId: challengeId, onSuccess: onSuccess };
    var codeInput = document.getElementById('mfa-challenge-code');
    if (codeInput) codeInput.value = '';
    var errorEl = document.getElementById('mfa-challenge-error');
    if (errorEl) errorEl.textContent = '';
    // Show challenge screen
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
    var screen = document.getElementById('screen-2fa-challenge');
    if (screen) screen.classList.add('active');
    // Focus code input
    setTimeout(function() { if (codeInput) codeInput.focus(); }, 300);
  }

  // Verify MFA code during login challenge
  async function doMfaVerify() {
    var sb = _getClient();
    if (!sb || !_mfaPending) return;
    var codeInput = document.getElementById('mfa-challenge-code');
    var code = codeInput ? codeInput.value.trim() : '';
    var errorEl = document.getElementById('mfa-challenge-error');
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      if (errorEl) errorEl.textContent = 'ENTER A 6-DIGIT CODE';
      return;
    }
    var btn = document.getElementById('mfa-challenge-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'VERIFYING...'; }
    try {
      var result = await sb.auth.mfa.verify({
        factorId: _mfaPending.factorId,
        challengeId: _mfaPending.challengeId,
        code: code
      });
      if (result.error) {
        if (errorEl) errorEl.textContent = 'INVALID CODE — TRY AGAIN';
        if (codeInput) codeInput.value = '';
        if (btn) { btn.disabled = false; btn.textContent = 'VERIFY'; }
        return;
      }
      // MFA verified — proceed with app entry
      var onSuccess = _mfaPending.onSuccess;
      _mfaPending = null;
      if (btn) { btn.disabled = false; btn.textContent = 'VERIFY'; }
      if (onSuccess) onSuccess();
    } catch (e) {
      if (errorEl) errorEl.textContent = 'ERROR: ' + e.message;
      if (btn) { btn.disabled = false; btn.textContent = 'VERIFY'; }
    }
  }

  // Update the MFA status display in settings
  async function updateMfaStatus() {
    var enabled = await isMfaEnabled();
    var label = document.getElementById('mfa-status-label');
    var btn = document.getElementById('mfa-toggle-btn');
    if (label) {
      label.textContent = enabled ? '2FA: ENABLED' : '2FA: DISABLED';
      label.className = 'security-status ' + (enabled ? 'enabled' : 'disabled');
    }
    if (btn) {
      btn.textContent = enabled ? 'DISABLE 2FA' : 'ENABLE 2FA';
      btn.className = 'security-btn ' + (enabled ? 'security-btn-disable' : 'security-btn-enable');
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
    _idbConfigPut: A._idbConfigPut,
    // Supabase defaults — single source of truth (sync module reads these)
    _DEFAULT_SUPA_URL: DEFAULT_SUPA_URL,
    _DEFAULT_SUPA_KEY: DEFAULT_SUPA_KEY,
    // Step 7E: MFA
    isMfaEnabled: isMfaEnabled,
    updateMfaStatus: updateMfaStatus
  });

  Object.assign(window, {
    doLogin: doLogin,
    doSignup: doSignup,
    doLogout: doLogout,
    showSignupForm: showSignupForm,
    showLoginForm: showLoginForm,
    // Step 7E: MFA
    doMfaVerify: doMfaVerify,
    doMfaEnrollVerify: doMfaEnrollVerify,
    toggleMfa: toggleMfa,
    // T2-B3: Password verify modal for onclick handlers
    _verifyPasswordConfirm: _verifyPasswordConfirm
  });

})();
