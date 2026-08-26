/* ================================================================
   おうちリズム — auth.js
   Firebase Authentication 管理
   ・Googleログイン
   ・メール＋パスワードログイン / 新規登録
   ・匿名ログイン（アカウントなしで使う）
   ・匿名 → Google / メールへのアカウント昇格（データ引き継ぎ）
   ================================================================ */
'use strict';

// ----------------------------------------------------------------
// 内部状態
// ----------------------------------------------------------------
let _auth    = null;   // Firebase Auth インスタンス
let _currentUser = null;  // 現在のユーザー（null = 未初期化 or 未ログイン）
let _authReady = false;   // onAuthStateChanged の初回コールバック済みか
let _authReadyCallbacks = [];

// Safari 通常ブラウザ判定
// Chrome/Edge は UA に "Chrome" を含むため Safari 専用かどうかを判別できる
function _isSafari() {
  const ua = navigator.userAgent;
  return /Safari/.test(ua) && !/Chrome/.test(ua) && !/Chromium/.test(ua);
}

// ポップアップの代わりにリダイレクトを使うべき環境かを判定する。
//
// 【COOP 問題について】
//   accounts.google.com は Cross-Origin-Opener-Policy: same-origin を返すため、
//   親ページが window.closed をポーリングしようとすると COOP によりブロックされる。
//   これは Google 側の仕様であり、こちらのサーバーヘッダーを変えても解決しない。
//   プライベートブラウジングでは Cookie 制限も重なりポップアップ認証が完了しないため、
//   Safari・iOS・プライベートブラウザでは最初からリダイレクト方式を使う。
function _shouldUseRedirect() {
  // Safari（iOS/macOS 通常ブラウザ）: ITP によるサードパーティ Cookie 制限
  if (_isSafari()) return true;

  // iOS の全ブラウザ: WebKit 強制のため同様に制限あり
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return true;

  // プライベートブラウジング検出（Safari / Firefox）
  // Safari プライベートは localStorage への書き込みで例外を投げる
  try {
    localStorage.setItem('__coop_test', '1');
    localStorage.removeItem('__coop_test');
  } catch (_) {
    return true;
  }

  return false;
}

// プライベートブラウジング検出の非同期版（Chrome incognito 判定用）
// Chrome incognito は localStorage が使えるが filesystem quota が極端に小さい。
// signInWithGoogle 呼び出し前に非同期で確認し、結果をキャッシュする。
let _redirectDecisionCache = null;
async function _resolveUseRedirect() {
  if (_redirectDecisionCache !== null) return _redirectDecisionCache;
  if (_shouldUseRedirect()) {
    _redirectDecisionCache = true;
    return true;
  }
  // Chrome incognito の検出: StorageManager の quota が 120MB 未満
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { quota } = await navigator.storage.estimate();
      if (quota < 120 * 1024 * 1024) {
        _redirectDecisionCache = true;
        return true;
      }
    }
  } catch (_) { /* 非対応ブラウザは無視 */ }
  _redirectDecisionCache = false;
  return false;
}

// エラーコードによるリダイレクトフォールバック判定
function _shouldFallbackToRedirect(err) {
  return [
    'auth/popup-blocked',
    'auth/cancelled-popup-request',
    'auth/operation-not-supported-in-this-environment',
    'auth/web-storage-unsupported',
    'auth/internal-error',
    'auth/unauthorized-domain',
    'auth/popup-closed-by-browser',
  ].includes(err?.code);
}

// ----------------------------------------------------------------
// 初期化
// ----------------------------------------------------------------
async function initAuth() {
  if (!FIREBASE_CONFIGURED) {
    // Firebase 未設定時はローカルモードとして即座に ready 扱い
    _authReady = true;
    _authReadyCallbacks.forEach(cb => cb(null));
    _authReadyCallbacks = [];
    return;
  }

  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    _auth = firebase.auth();

    // 日本語UIを設定
    _auth.languageCode = 'ja';

    // ----------------------------------------------------------------
    // 初期化の正しい順序：
    //
    //  1. setPersistence  … Auth の IndexedDB ストレージ設定
    //  2. onAuthStateChanged 登録  … Firebase 12 compat では getRedirectResult が
    //                                内部的に onAuthStateChanged を待つ実装になっており、
    //                                登録前に getRedirectResult を await すると
    //                                永遠に解決しない（プライベートを含む全ブラウザで詰まる）
    //  3. getRedirectResult  … onAuthStateChanged 登録後に並行して呼ぶ
    //  4. initFirestore … Firestore の enablePersistence は Auth の IndexedDB 操作と
    //                     競合するため、setPersistence の完了後に呼ぶ
    //
    // onAuthStateChanged の「初回 null → 実ユーザー」2回発火問題は、
    // getRedirectResult の結果が出るまで onAuthReady の発火を保留することで回避する。
    // ----------------------------------------------------------------

    await _auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(e => {
      console.warn('[Auth] setPersistence 失敗（無視して続行）:', e.code);
    });

    // setPersistence 完了後に Firestore を初期化（IndexedDB 競合を回避）
    initFirestore();
    extendDBWithCloud();

    // getRedirectResult の結果を保持するための Promise
    // onAuthStateChanged コールバック内で参照し、発火を getRedirectResult 完了まで保留する
    let _redirectResultHandled = false;
    const redirectPromise = _auth.getRedirectResult().then(result => {
      if (result?.user) {
        _currentUser = result.user;
        closeAuthModal();
        console.log('[Auth] Redirect ログイン成功:', result.user.uid);
      }
      _redirectResultHandled = true;
    }).catch(err => {
      _redirectResultHandled = true;
      const silentCodes = [
        'auth/no-auth-event',
        'auth/null-user',
        'auth/web-storage-unsupported',
        'auth/operation-not-supported-in-this-environment',
      ];
      if (err?.code && !silentCodes.includes(err.code)) {
        console.warn('[Auth] getRedirectResult エラー:', err.code, err.message);
      }
    });

    // onAuthStateChanged を登録する（getRedirectResult より先に登録が必要）
    _auth.onAuthStateChanged(async user => {
      const prevUid    = _currentUser?.uid    || null;
      const prevIsAnon = _currentUser?.isAnonymous ?? true;

      // Redirect 成功時は _currentUser が既に設定済みなので上書きしない
      if (!_currentUser) _currentUser = user;

      if (!_authReady) {
        // getRedirectResult が完了するまで onAuthReady の発火を待つ
        await redirectPromise;

        // redirectPromise 完了後に _currentUser が実ユーザーに更新されている場合がある
        // ので、ここで最新の currentUser を参照する
        const resolvedUser = _auth.currentUser;
        if (resolvedUser && !resolvedUser.isAnonymous) {
          _currentUser = resolvedUser;
        } else if (!_currentUser) {
          _currentUser = user;
        }

        _authReady = true;
        _authReadyCallbacks.forEach(cb => cb(_currentUser));
        _authReadyCallbacks = [];
        updateAuthUI(_currentUser);
        if (_currentUser && !_currentUser.isAnonymous) {
          onUserSignedIn?.(_currentUser);
        }
      } else {
        // 2回目以降（再ログイン・ログアウト）
        _currentUser = user;
        if (user && (
          user.uid !== prevUid ||
          (prevIsAnon && !user.isAnonymous)
        )) {
          onUserSignedIn?.(user);
        } else if (!user && prevUid) {
          stopRealtimeSync?.();
        }
        updateAuthUI(_currentUser);
      }
    });
  } catch (e) {
    console.error('[Auth] 初期化失敗:', e);
    _authReady = true;
    _authReadyCallbacks.forEach(cb => cb(null));
    _authReadyCallbacks = [];
  }
}

// 認証が初期化完了してから処理を実行するためのヘルパー
function onAuthReady(cb) {
  if (_authReady) { cb(_currentUser); return; }
  _authReadyCallbacks.push(cb);
}

// ----------------------------------------------------------------
// ログイン方法
// ----------------------------------------------------------------

// 1) Googleログイン
async function signInWithGoogle() {
  if (!_auth) return { error: 'Firebase未設定' };
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    // Safari / iOS / プライベートブラウザ / Chrome incognito は
    // COOP・ITP の影響でポップアップ認証が機能しないため最初からリダイレクト方式を使う
    const useRedirect = await _resolveUseRedirect();

    if (_currentUser?.isAnonymous) {
      if (useRedirect) {
        await _currentUser.linkWithRedirect(provider);
        return { ok: true };
      }
      try {
        await _currentUser.linkWithPopup(provider);
        showToast('Googleアカウントと連携しました！データを引き継ぎました');
      } catch (linkErr) {
        // 既存の実アカウントと同じGoogleアカウントを選択した場合は
        // linkWithPopup が失敗するので、通常のサインインにフォールバック。
        if (linkErr.code === 'auth/credential-already-in-use' ||
            linkErr.code === 'auth/account-exists-with-different-credential') {
          const cred = linkErr.credential
            ? _auth.signInWithCredential(linkErr.credential)
            : _auth.signInWithPopup(provider);
          await cred;
        } else if (_shouldFallbackToRedirect(linkErr)) {
          await _currentUser.linkWithRedirect(provider);
          return { ok: true };
        } else {
          throw linkErr;
        }
      }
    } else {
      if (useRedirect) {
        await _auth.signInWithRedirect(provider);
        return { ok: true };
      }
      try {
        await _auth.signInWithPopup(provider);
      } catch (popupErr) {
        if (_shouldFallbackToRedirect(popupErr)) {
          await _auth.signInWithRedirect(provider);
          return { ok: true };
        }
        throw popupErr;
      }
    }
    closeAuthModal();
    return { ok: true };
  } catch (e) {
    // Redirect 経由・その他で credential-already-in-use が来た場合のフォールバック
    if ((e.code === 'auth/credential-already-in-use' ||
         e.code === 'auth/account-exists-with-different-credential') && e.credential) {
      try {
        await _auth.signInWithCredential(e.credential);
        closeAuthModal();
        return { ok: true };
      } catch (e2) {
        return { error: _authErrorMsg(e2) };
      }
    }
    return { error: _authErrorMsg(e) };
  }
}

// 2) メール＋パスワード ログイン
async function signInWithEmail(email, password) {
  if (!_auth) return { error: 'Firebase未設定' };
  try {
    if (_currentUser?.isAnonymous) {
      // 匿名から昇格
      const credential = firebase.auth.EmailAuthProvider.credential(email, password);
      await _currentUser.linkWithCredential(credential);
      showToast('アカウントを登録しました！データを引き継ぎました');
    } else {
      await _auth.signInWithEmailAndPassword(email, password);
    }
    closeAuthModal();
    return { ok: true };
  } catch (e) {
    return { error: _authErrorMsg(e) };
  }
}

// 3) メール＋パスワード 新規登録
async function signUpWithEmail(email, password) {
  if (!_auth) return { error: 'Firebase未設定' };
  try {
    if (_currentUser?.isAnonymous) {
      const credential = firebase.auth.EmailAuthProvider.credential(email, password);
      await _currentUser.linkWithCredential(credential);
      showToast('アカウントを登録しました！データを引き継ぎました');
    } else {
      await _auth.createUserWithEmailAndPassword(email, password);
    }
    closeAuthModal();
    return { ok: true };
  } catch (e) {
    return { error: _authErrorMsg(e) };
  }
}

// 4) 匿名ログイン
async function signInAnonymously() {
  if (!_auth) return { error: 'Firebase未設定' };
  try {
    await _auth.signInAnonymously();
    closeAuthModal();
    showToast('アカウントなしで開始しました');
    return { ok: true };
  } catch (e) {
    return { error: _authErrorMsg(e) };
  }
}

// 5) パスワードリセットメール送信
async function sendPasswordReset(email) {
  if (!_auth) return { error: 'Firebase未設定' };
  try {
    await _auth.sendPasswordResetEmail(email);
    return { ok: true };
  } catch (e) {
    return { error: _authErrorMsg(e) };
  }
}

// 6) ログアウト
async function signOut() {
  if (!_auth) return;
  // ログアウト前にローカルストレージのアプリデータを全削除
  // → 別アカウントでログインしたときに前のユーザーのデータが残らないようにする
  if (typeof DB !== 'undefined') {
    Object.values(DB.K).forEach(k => localStorage.removeItem(k));
  }
  await _auth.signOut();
  showToast('ログアウトしました');
  // ページをリロードして状態をリセット
  location.reload();
}

// ----------------------------------------------------------------
// エラーメッセージ日本語化
// ----------------------------------------------------------------
function _authErrorMsg(e) {
  const map = {
    'auth/user-not-found':                          'メールアドレスが見つかりません',
    'auth/wrong-password':                          'パスワードが間違っています',
    'auth/invalid-email':                           'メールアドレスの形式が正しくありません',
    'auth/email-already-in-use':                    'このメールアドレスは既に使われています',
    'auth/weak-password':                           'パスワードは6文字以上にしてください',
    'auth/too-many-requests':                       'しばらく時間をおいてから再試行してください',
    'auth/popup-closed-by-user':                    'ログインをキャンセルしました',
    'auth/popup-blocked':                           'ポップアップがブロックされました。ブラウザの設定をご確認ください',
    'auth/network-request-failed':                  'ネットワークエラーが発生しました',
    'auth/invalid-credential':                      'メールアドレスまたはパスワードが正しくありません',
    'auth/credential-already-in-use':               'このGoogleアカウントは別の方法でログインしてください',
    'auth/account-exists-with-different-credential':'このGoogleアカウントは既に登録済みです。再度ログインをお試しください',
  };
  return map[e.code] || `エラーが発生しました（${e.code || e.message}）`;
}

// ----------------------------------------------------------------
// 現在ユーザーの取得
// ----------------------------------------------------------------
function getCurrentUser() { return _currentUser; }
function isLoggedIn()    { return !!_currentUser && !_currentUser.isAnonymous; }
function isAnonymous()   { return !!_currentUser?.isAnonymous; }
function getUserId()     { return _currentUser?.uid || null; }

// ----------------------------------------------------------------
// 認証モーダル UI
// ----------------------------------------------------------------
function openAuthModal(mode = 'login') {
  const modal = document.getElementById('modal-auth');
  if (!modal) return;
  modal.classList.remove('hidden');
  switchAuthTab(mode);
}

function closeAuthModal() {
  const modal = document.getElementById('modal-auth');
  if (!modal) return;
  modal.classList.add('hidden');
  // エラーをクリア
  document.querySelectorAll('.auth-error').forEach(el => { el.textContent = ''; el.style.display = 'none'; });
}

function switchAuthTab(mode) {
  const tabs  = ['login', 'register', 'reset'];
  tabs.forEach(t => {
    const tab   = document.getElementById(`auth-tab-${t}`);
    const panel = document.getElementById(`auth-panel-${t}`);
    if (tab)   tab.classList.toggle('active', t === mode);
    if (panel) panel.style.display = t === mode ? '' : 'none';
  });
}

// 設定画面のアカウント情報エリアを更新
function updateAuthUI(user) {
  const areaEl = document.getElementById('auth-account-area');
  if (!areaEl) return;

  if (!FIREBASE_CONFIGURED) {
    areaEl.innerHTML = `
      <div class="auth-status-row">
        <div class="auth-status-info">
          <div class="auth-status-name">ローカルモード</div>
          <div class="auth-status-sub">firebase-config.js を設定するとクラウド同期が使えます</div>
        </div>
      </div>`;
    return;
  }

  if (!user) {
    areaEl.innerHTML = `
      <div class="auth-status-row">
        <div class="auth-status-info">
          <div class="auth-status-name">ログインしていません</div>
          <div class="auth-status-sub">データはこのデバイスにのみ保存されます</div>
        </div>
        <button class="btn-primary auth-login-btn" id="btn-open-auth" style="margin:0;padding:8px 16px;font-size:13px;">ログイン</button>
      </div>`;
    document.getElementById('btn-open-auth')?.addEventListener('click', () => openAuthModal('login'));
    return;
  }

  if (user.isAnonymous) {
    areaEl.innerHTML = `
      <div class="auth-status-row">
        <div class="auth-status-info">
          <div class="auth-status-name">ゲストモード</div>
          <div class="auth-status-sub">アカウント登録するとデータを保護できます</div>
        </div>
        <button class="btn-secondary auth-login-btn" id="btn-upgrade-auth" style="margin:0;padding:8px 16px;font-size:13px;">登録する</button>
      </div>`;
    document.getElementById('btn-upgrade-auth')?.addEventListener('click', () => openAuthModal('register'));
    return;
  }

  const displayName = user.displayName || user.email || 'ユーザー';
  const provider = user.providerData?.[0]?.providerId === 'google.com' ? 'Google' : 'メール';
  areaEl.innerHTML = `
    <div class="auth-status-row">
      <div class="auth-status-avatar">${displayName.charAt(0).toUpperCase()}</div>
      <div class="auth-status-info">
        <div class="auth-status-name">${displayName}</div>
        <div class="auth-status-sub" style="white-space:nowrap;">${provider}アカウント · クラウド同期中</div>
      </div>
      <button class="btn-secondary" id="btn-signout" style="margin:0;padding:8px 16px;font-size:13px;white-space:nowrap;flex-shrink:0;">ログアウト</button>
    </div>`;
  document.getElementById('btn-signout')?.addEventListener('click', signOut);
}

// ----------------------------------------------------------------
// 認証モーダルのイベントバインド
// ----------------------------------------------------------------
function bindAuthEvents() {
  const modal = document.getElementById('modal-auth');
  if (!modal) return;

  // 閉じる
  document.getElementById('modal-auth-close')?.addEventListener('click', closeAuthModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeAuthModal(); });

  // タブ切り替え
  ['login', 'register', 'reset'].forEach(t => {
    document.getElementById(`auth-tab-${t}`)?.addEventListener('click', () => switchAuthTab(t));
  });

  // Googleログイン
  document.getElementById('btn-google-login')?.addEventListener('click', async () => {
    const r = await signInWithGoogle();
    if (r.error) _showAuthError('auth-error-login', r.error);
  });
  document.getElementById('btn-google-register')?.addEventListener('click', async () => {
    const r = await signInWithGoogle();
    if (r.error) _showAuthError('auth-error-register', r.error);
  });

  // メールログイン
  document.getElementById('btn-email-login')?.addEventListener('click', async () => {
    const email    = document.getElementById('auth-login-email').value.trim();
    const password = document.getElementById('auth-login-password').value;
    if (!email || !password) { _showAuthError('auth-error-login', 'メールとパスワードを入力してください'); return; }
    const r = await signInWithEmail(email, password);
    if (r.error) _showAuthError('auth-error-login', r.error);
  });

  // メール新規登録
  document.getElementById('btn-email-register')?.addEventListener('click', async () => {
    const email    = document.getElementById('auth-register-email').value.trim();
    const password = document.getElementById('auth-register-password').value;
    const confirm  = document.getElementById('auth-register-confirm').value;
    if (!email || !password) { _showAuthError('auth-error-register', 'メールとパスワードを入力してください'); return; }
    if (password.length < 6)  { _showAuthError('auth-error-register', 'パスワードは6文字以上にしてください'); return; }
    if (password !== confirm)  { _showAuthError('auth-error-register', 'パスワードが一致しません'); return; }
    const r = await signUpWithEmail(email, password);
    if (r.error) _showAuthError('auth-error-register', r.error);
  });

  // 匿名で使う
  document.getElementById('btn-anon-login')?.addEventListener('click', async () => {
    const r = await signInAnonymously();
    if (r.error) _showAuthError('auth-error-login', r.error);
  });

  // パスワードリセット
  document.getElementById('btn-send-reset')?.addEventListener('click', async () => {
    const email = document.getElementById('auth-reset-email').value.trim();
    if (!email) { _showAuthError('auth-error-reset', 'メールアドレスを入力してください'); return; }
    const r = await sendPasswordReset(email);
    if (r.ok) {
      _showAuthError('auth-error-reset', '✅ リセットメールを送信しました', true);
    } else {
      _showAuthError('auth-error-reset', r.error);
    }
  });

  // 「パスワードをお忘れの方」リンク
  document.getElementById('auth-link-reset')?.addEventListener('click', e => {
    e.preventDefault();
    const email = document.getElementById('auth-login-email').value.trim();
    if (email) document.getElementById('auth-reset-email').value = email;
    switchAuthTab('reset');
  });

  // 「アカウントを作成」リンク
  document.getElementById('auth-link-register')?.addEventListener('click', e => {
    e.preventDefault();
    switchAuthTab('register');
  });

  // 「ログインに戻る」リンク
  document.querySelectorAll('.auth-link-login').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); switchAuthTab('login'); });
  });
}

function _showAuthError(id, msg, isSuccess = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.color = isSuccess ? 'var(--g600)' : 'var(--rose)';
}
