/* ================================================================
   おうちリズム — db-cloud.js
   Firestore ↔ メモリキャッシュの同期レイヤー

   【設計思想】
   - LocalStorage は廃止。全ユーザーデータは _cache（app.js）に保持。
   - 匿名ユーザー：_cache のみで完結。Firestore への読み書きは一切しない。
   - ログインユーザー：Firestore が唯一の永続ストレージ。
     - 起動時に Firestore からダウンロードして _cache を初期化
     - DB.set() が呼ばれると Firestore へも書き込む
     - onSnapshot でリアルタイム変更を _cache に反映して再描画
   ================================================================ */
'use strict';

// ----------------------------------------------------------------
// Firestore コレクション / ドキュメント設計（サブコレクション方式）
//
//   users/{uid}            → meta（settings, tutorial_cleared 等）
//   users/{uid}/tasks/{id} → タスク1件1ドキュメント
//   users/{uid}/logs/{id}  → 完了ログ1件1ドキュメント
//   users/{uid}/period_days/{date} → 生理記録1日1ドキュメント
// ----------------------------------------------------------------

let _db = null;  // Firestore インスタンス

async function initFirestore() {
  if (!FIREBASE_CONFIGURED) return;
  try {
    const {
      initializeFirestore,
      persistentMultipleTabManager,
      persistentLocalCache,
      memoryLocalCache,
    } = await import('https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js');

    const modularApp = firebase.app()._delegate;

    let cache;
    try {
      cache = persistentMultipleTabManager();
    } catch {
      try {
        cache = persistentLocalCache();
      } catch {
        console.warn('[DB] オフラインキャッシュ非対応（Safari プライベート等）、メモリキャッシュを使用');
        cache = memoryLocalCache();
      }
    }

    initializeFirestore(modularApp, { cache });
    _db = firebase.firestore();
  } catch (e) {
    console.error('[DB] Firestore 初期化失敗:', e);
    try { _db = firebase.firestore(); } catch {}
  }
}

// ユーザーのコレクション / ドキュメント参照
function _userCol(uid, col) {
  return _db.collection('users').doc(uid).collection(col);
}
function _userDoc(uid) {
  return _db.collection('users').doc(uid);
}

// ----------------------------------------------------------------
// Firestore → _cache の一括ダウンロード（ログイン時の初期化）
// ----------------------------------------------------------------
async function downloadCloudDataToCache(uid) {
  if (!_db || !uid) return false;
  try {
    const opts = { source: 'server' };

    // meta（settings, tutorial_cleared 等）
    const metaSnap = await _userDoc(uid).get(opts);
    if (metaSnap.exists) {
      const meta = metaSnap.data();
      if (meta.settings          != null) _cache[DB.K.settings]          = meta.settings;
      if (meta.tutorial_cleared  != null) _cache[DB.K.tutorial_cleared]  = meta.tutorial_cleared;
      if (meta.unlocked          != null) _cache[DB.K.unlocked]          = meta.unlocked;
      if (meta.dismissed_suggest != null) _cache[DB.K.dismissed_suggest] = meta.dismissed_suggest;
      if (meta.title_shown       != null) _cache[DB.K.title_shown]       = meta.title_shown;
    }

    // tasks（空でも必ず上書きして古いキャッシュを排除）
    const tasksSnap = await _userCol(uid, 'tasks').get(opts);
    _cache[DB.K.tasks] = tasksSnap.docs.map(d => d.data());

    // logs
    const logsSnap = await _userCol(uid, 'logs').get(opts);
    _cache[DB.K.logs] = logsSnap.docs.map(d => d.data());

    // period_days
    const periodsSnap = await _userCol(uid, 'period_days').get(opts);
    _cache[DB.K.period_days] = periodsSnap.docs.map(d => d.data());

    console.log('[DB] クラウドデータを _cache に読み込みました');
    return true;
  } catch (e) {
    console.error('[DB] ダウンロード失敗:', e);
    return false;
  }
}

// ----------------------------------------------------------------
// リアルタイム同期（Firestore → _cache → 画面再描画）
// 他デバイス・他タブからの変更を自動反映する
// ----------------------------------------------------------------
const _unsubscribers = [];

function startRealtimeSync(uid) {
  if (!_db || !uid) return;
  stopRealtimeSync(); // 二重登録防止

  // onSnapshot 登録直後の初回コールバックをスキップ
  // （downloadCloudDataToCache で取得済みのデータをキャッシュベースの初回コールバックで上書きしない）
  let _skip = { tasks: true, logs: true, period_days: true, meta: true };

  // tasks
  _unsubscribers.push(
    _userCol(uid, 'tasks').onSnapshot(snap => {
      if (_skip.tasks) { _skip.tasks = false; return; }
      if (snap.metadata.hasPendingWrites) return; // 自分の書き込みは無視
      _cache[DB.K.tasks] = snap.docs.map(d => d.data());
      renderCalendar?.();
      renderTaskList?.();
    }, err => console.warn('[Sync] tasks:', err))
  );

  // logs
  _unsubscribers.push(
    _userCol(uid, 'logs').onSnapshot(snap => {
      if (_skip.logs) { _skip.logs = false; return; }
      if (snap.metadata.hasPendingWrites) return;
      _cache[DB.K.logs] = snap.docs.map(d => d.data());
      renderCalendar?.();
    }, err => console.warn('[Sync] logs:', err))
  );

  // period_days
  _unsubscribers.push(
    _userCol(uid, 'period_days').onSnapshot(snap => {
      if (_skip.period_days) { _skip.period_days = false; return; }
      if (snap.metadata.hasPendingWrites) return;
      _cache[DB.K.period_days] = snap.docs.map(d => d.data());
      renderPeriod?.();
    }, err => console.warn('[Sync] period_days:', err))
  );

  // meta（serverTimestamp 解決で2回コールバックが来るため変化検出あり）
  _unsubscribers.push(
    _userDoc(uid).onSnapshot(snap => {
      if (_skip.meta) { _skip.meta = false; return; }
      if (snap.metadata.hasPendingWrites) return;
      if (!snap.exists) return;
      const meta = snap.data();
      let changed = false;
      const applyMeta = (field, key) => {
        if (meta[field] == null) return;
        const prev = JSON.stringify(_cache[key]);
        const next = JSON.stringify(meta[field]);
        if (prev !== next) { _cache[key] = meta[field]; changed = true; }
      };
      applyMeta('settings',          DB.K.settings);
      applyMeta('unlocked',          DB.K.unlocked);
      applyMeta('tutorial_cleared',  DB.K.tutorial_cleared);
      applyMeta('dismissed_suggest', DB.K.dismissed_suggest);
      applyMeta('title_shown',       DB.K.title_shown);
      if (changed) renderCalendar?.();
    }, err => console.warn('[Sync] meta:', err))
  );

  console.log('[DB] リアルタイム同期を開始しました');
}

function stopRealtimeSync() {
  _unsubscribers.forEach(unsub => unsub());
  _unsubscribers.length = 0;
}

// ----------------------------------------------------------------
// DB.set フック：ログインユーザーの書き込みを Firestore に反映する
// app.js 起動後に呼び出し、DB.set を上書きする
// ----------------------------------------------------------------
function extendDBWithCloud() {
  const originalSet = DB.set.bind(DB);

  DB.set = function(k, v) {
    // メモリキャッシュへの書き込みは常に実行
    originalSet(k, v);

    // 匿名 / 未ログイン / Firebase未設定 → Firestoreには書かない
    if (!_db || !FIREBASE_CONFIGURED) return;
    if (isAnonymous?.()) return;
    const uid = getUserId?.();
    if (!uid) return;

    // Firestore へ非同期で書き込む（エラーはログのみ）
    _cloudWrite(uid, k, v).catch(e => console.warn('[DB] クラウド書き込み失敗:', e));
  };
}

// ----------------------------------------------------------------
// Firestore への書き込み（サブコレクション方式）
// ----------------------------------------------------------------
async function _cloudWrite(uid, k, v) {
  switch (k) {
    case DB.K.tasks:
      await _syncCollection(uid, 'tasks', v, 'id');
      break;
    case DB.K.logs:
      await _syncCollection(uid, 'logs', v, 'id');
      break;
    case DB.K.period_days:
      await _syncCollection(uid, 'period_days', v, 'date');
      break;
    case DB.K.settings:
    case DB.K.tutorial_cleared:
    case DB.K.unlocked:
    case DB.K.dismissed_suggest:
    case DB.K.title_shown:
      await _userDoc(uid).set(
        { [_metaField(k)]: v, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      break;
    case DB.K.partner:
      // partner はメモリ管理専用。Firestore への書き込みは行わない。
      break;
  }
}

// コレクションを全件同期（サブコレクション方式）
// 新規・更新は set、削除は Firestore 上に存在して items にないドキュメントを delete する
async function _syncCollection(uid, col, items, idField) {
  const colRef = _db.collection('users').doc(uid).collection(col);
  const batch  = _db.batch();
  let   hasOps = false;

  // 書き込み・更新
  items.forEach(item => {
    batch.set(colRef.doc(String(item[idField])), item);
    hasOps = true;
  });

  // 削除：Firestore 上に存在して items にないドキュメントを探す
  const newIds    = new Set(items.map(i => String(i[idField])));
  const existing  = await colRef.get();
  existing.docs.forEach(doc => {
    if (!newIds.has(doc.id)) { batch.delete(doc.ref); hasOps = true; }
  });

  if (hasOps) await batch.commit();
}

// DB.K キー → meta フィールド名
function _metaField(k) {
  const map = {
    [DB.K.settings]:          'settings',
    [DB.K.tutorial_cleared]:  'tutorial_cleared',
    [DB.K.unlocked]:          'unlocked',
    [DB.K.dismissed_suggest]: 'dismissed_suggest',
    [DB.K.title_shown]:       'title_shown',
  };
  return map[k] || k;
}

// ----------------------------------------------------------------
// ログイン後の初期化フロー
// ----------------------------------------------------------------
const _signingInPromises = {};

function onUserSignedIn(user) {
  if (!_db) return Promise.resolve();
  const uid = user.uid;
  if (_signingInPromises[uid]) return _signingInPromises[uid];
  _signingInPromises[uid] = _doUserSignedIn(uid).finally(() => {
    delete _signingInPromises[uid];
  });
  return _signingInPromises[uid];
}

async function _doUserSignedIn(uid) {
  showSyncStatus('同期中…');
  let syncReady = false;
  try {
    const ok = await downloadCloudDataToCache(uid);
    if (ok) {
      showToast('データを読み込みました');
      syncReady = true;
    } else {
      showToast('同期に失敗しました。再度お試しください');
    }
  } catch (e) {
    console.error('[DB] onUserSignedIn 中にエラー:', e);
  } finally {
    hideSyncStatus();
    if (syncReady) startRealtimeSync(uid);
    renderCalendar?.();
    renderTaskList?.();
    renderPeriod?.();
    renderSettings?.();
  }
}

// ----------------------------------------------------------------
// 同期中インジケーター
// ----------------------------------------------------------------
function showSyncStatus(msg) {
  let el = document.getElementById('sync-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sync-status';
    el.className = 'sync-status-bar';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.display = 'flex';
}

function hideSyncStatus() {
  const el = document.getElementById('sync-status');
  if (el) el.style.display = 'none';
}

// ================================================================
// パートナー共有ルーム（Firestore）
//
// share_rooms/{roomId}
//   ownerUid   : string  招待した側のUID
//   partnerUid : string|null  参加した側のUID
//   createdAt  : Timestamp
//
// share_rooms/{roomId}/comments/{id}
//   uid        : string  投稿者UID
//   text       : string
//   createdAt  : Timestamp
//
// 生理データは既存の users/{uid}/period_days を参照するだけ（コピーしない）
// ================================================================

let _roomUnsub          = null;
let _partnerPeriodUnsub = null;
let _commentsUnsub      = null;

function _roomRef(roomId) {
  return _db.collection('share_rooms').doc(roomId);
}
function _commentsRef(roomId) {
  return _db.collection('share_rooms').doc(roomId).collection('comments');
}

const INVITE_EXPIRE_MS = 72 * 60 * 60 * 1000;

async function createShareRoom() {
  if (!_db) return { error: 'Firebase未設定' };
  const uid = getUserId?.();
  if (!uid) return { error: 'ログインが必要です' };
  if (isAnonymous?.()) return { error: 'パートナー共有にはアカウント登録が必要です' };
  try {
    const roomRef = _db.collection('share_rooms').doc();
    const expiresAt = new Date(Date.now() + INVITE_EXPIRE_MS);
    await roomRef.set({
      ownerUid:   uid,
      partnerUid: null,
      createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
      expiresAt:  firebase.firestore.Timestamp.fromDate(expiresAt),
    });
    return { ok: true, roomId: roomRef.id };
  } catch (e) {
    console.error('[Share] ルーム作成失敗:', e);
    return { error: e.message };
  }
}

async function joinShareRoom(roomId) {
  if (!_db) return { error: 'Firebase未設定' };
  const uid = getUserId?.();
  if (!uid) return { error: 'ログインが必要です' };
  if (isAnonymous?.()) return { error: 'パートナー共有にはアカウント登録が必要です' };
  try {
    const snap = await _roomRef(roomId).get();
    if (!snap.exists) return { error: '招待リンクが無効です' };
    const room = snap.data();
    if (room.ownerUid === uid) return { error: '自分自身とは共有できません' };
    if (room.partnerUid && room.partnerUid !== uid) return { error: 'このルームは既に使用されています' };
    if (room.expiresAt) {
      const expiry = room.expiresAt.toDate ? room.expiresAt.toDate() : new Date(room.expiresAt);
      if (Date.now() > expiry.getTime()) {
        return { error: '招待リンクの有効期限が切れています（72時間以内に参加が必要です）' };
      }
    }
    if (!room.partnerUid) {
      await _roomRef(roomId).update({ partnerUid: uid });
    }
    return { ok: true, room: { ...room, partnerUid: uid } };
  } catch (e) {
    console.error('[Share] ルーム参加失敗:', e);
    return { error: e.message };
  }
}

async function findMyRoom() {
  if (!_db) return null;
  const uid = getUserId?.();
  if (!uid) return null;
  try {
    const ownerSnap = await _db.collection('share_rooms')
      .where('ownerUid', '==', uid).orderBy('createdAt', 'desc').limit(1).get();
    if (!ownerSnap.empty) return { id: ownerSnap.docs[0].id, ...ownerSnap.docs[0].data() };
    const partnerSnap = await _db.collection('share_rooms')
      .where('partnerUid', '==', uid).orderBy('createdAt', 'desc').limit(1).get();
    if (!partnerSnap.empty) return { id: partnerSnap.docs[0].id, ...partnerSnap.docs[0].data() };
    return null;
  } catch (e) {
    console.error('[Share] ルーム検索失敗:', e);
    return null;
  }
}

function startShareRoomSync(roomId, onRoomUpdate, onPartnerPeriodUpdate) {
  stopShareRoomSync();
  _roomUnsub = _roomRef(roomId).onSnapshot(snap => {
    if (!snap.exists) return;
    onRoomUpdate?.(snap.data());
    const room = snap.data();
    const uid = getUserId?.();
    const partnerUid = room.ownerUid === uid ? room.partnerUid : room.ownerUid;
    if (partnerUid && !_partnerPeriodUnsub) {
      _partnerPeriodUnsub = _db.collection('users').doc(partnerUid)
        .collection('period_days')
        .onSnapshot(snap => {
          const days = snap.docs.map(d => d.data());
          onPartnerPeriodUpdate?.(days);
        }, err => console.warn('[Share] partner period_days:', err));
    }
  }, err => console.warn('[Share] room:', err));
}

function stopShareRoomSync() {
  _roomUnsub?.();          _roomUnsub = null;
  _partnerPeriodUnsub?.(); _partnerPeriodUnsub = null;
  _commentsUnsub?.();      _commentsUnsub = null;
}

async function postComment(roomId, text) {
  if (!_db || !text.trim()) return;
  const uid = getUserId?.();
  if (!uid) return;
  try {
    await _commentsRef(roomId).add({
      uid,
      text:      text.trim(),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('[Share] コメント投稿失敗:', e);
  }
}

function listenComments(roomId, onUpdate) {
  _commentsUnsub?.();
  _commentsUnsub = _commentsRef(roomId)
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      onUpdate?.(comments);
    }, err => console.warn('[Share] comments:', err));
}

async function leaveShareRoom(roomId) {
  if (!_db) return;
  const uid = getUserId?.();
  if (!uid) return;
  try {
    stopShareRoomSync();
    await _roomRef(roomId).delete();
  } catch (e) {
    console.error('[Share] ルーム解除失敗:', e);
  }
}

async function notifyPartnerPeriodUpdate(roomId) {
  if (!_db || !roomId) return;
  const uid = getUserId?.();
  if (!uid) return;
  try {
    await _roomRef(roomId).collection('notifications').add({
      fromUid:   uid,
      type:      'period_updated',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('[Share] 通知書き込み失敗:', e);
  }
}

function listenPartnerNotifications(roomId, onNotify) {
  if (!_db || !roomId) return;
  const uid = getUserId?.();
  if (!uid) return;
  const since = firebase.firestore.Timestamp.now();
  _db.collection('share_rooms').doc(roomId)
    .collection('notifications')
    .where('fromUid', '!=', uid)
    .where('createdAt', '>=', since)
    .onSnapshot(snap => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') onNotify?.(change.doc.data());
      });
    }, err => console.warn('[Share] notifications:', err));
}
