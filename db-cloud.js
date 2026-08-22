/* ================================================================
   おうちリズム — db-cloud.js
   Firestore ↔ localStorage の二重書き込みレイヤー

   【設計思想】
   - Firebase 未設定 or 未ログイン時は localStorage のみで動作
   - ログイン後は localStorage + Firestore の両方に書き込む
   - ログイン時にクラウドのデータを localStorage に同期（マージ）
   - app.js の DB.get / DB.set はそのまま使い続けられる
   ================================================================ */
'use strict';

// ----------------------------------------------------------------
// Firestore コレクション / ドキュメント設計
//
//   users/{uid}/meta        → settings, tutorial_cleared 等のシングル値
//   users/{uid}/tasks       → コレクション（各ドキュメントがタスク1件）
//   users/{uid}/logs        → コレクション（完了ログ）
//   users/{uid}/period_days → コレクション（生理記録 1日1件）
//   users/{uid}/unlocked    → meta に配列として保存
// ----------------------------------------------------------------

let _db = null;  // Firestore インスタンス

function initFirestore() {
  if (!FIREBASE_CONFIGURED) return;
  try {
    _db = firebase.firestore();
    // オフラインキャッシュを有効にする（PWA 対応）
    _db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  } catch (e) {
    console.error('[DB] Firestore 初期化失敗:', e);
  }
}

// ユーザーのルートコレクションパスを返す
function _userCol(uid, col) {
  return _db.collection('users').doc(uid).collection(col);
}
function _userDoc(uid) {
  return _db.collection('users').doc(uid);
}

// ----------------------------------------------------------------
// Firestore ← localStorage の一括アップロード（初回ログイン時）
// ----------------------------------------------------------------
async function uploadLocalDataToCloud(uid) {
  if (!_db || !uid) return;
  try {
    const batch = _db.batch();
    const userDoc = _userDoc(uid);

    // meta ドキュメント（settings, tutorial_cleared, unlocked, dismissed_suggest, title_shown）
    const metaData = {
      settings:          DB.getObj(DB.K.settings, DEFAULT_SETTINGS),
      tutorial_cleared:  DB.getObj(DB.K.tutorial_cleared, false),
      unlocked:          DB.get(DB.K.unlocked),
      dismissed_suggest: DB.get(DB.K.dismissed_suggest),
      title_shown:       DB.get(DB.K.title_shown),
      updatedAt:         firebase.firestore.FieldValue.serverTimestamp(),
    };
    batch.set(userDoc, metaData, { merge: true });

    // tasks
    const tasks = DB.get(DB.K.tasks);
    tasks.forEach(t => {
      batch.set(_userCol(uid, 'tasks').doc(t.id), t);
    });

    // logs
    const logs = DB.get(DB.K.logs);
    logs.forEach(l => {
      batch.set(_userCol(uid, 'logs').doc(l.id), l);
    });

    // period_days
    const periods = DB.get(DB.K.period_days);
    periods.forEach(p => {
      batch.set(_userCol(uid, 'period_days').doc(p.date), p);
    });

    await batch.commit();
    console.log('[DB] ローカルデータをクラウドにアップロードしました');
  } catch (e) {
    console.error('[DB] アップロード失敗:', e);
  }
}

// ----------------------------------------------------------------
// Firestore → localStorage の一括ダウンロード（ログイン時）
//
// 【重要】ここでは DB.set ではなく _localSet（localStorage直書き）を使う。
//   DB.set は extendDBWithCloud() によって Firestore への再アップロードを
//   行うよう上書きされているため、ダウンロード中に DB.set を呼ぶと
//   ダウンロードしたばかりのデータを即座に Firestore へ書き戻してしまい
//   競合・不整合の原因になる。
// ----------------------------------------------------------------
async function downloadCloudDataToLocal(uid) {
  if (!_db || !uid) return false;
  // localStorage への直書き関数（Firestoreへの副作用なし）
  const _localSet = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  };
  try {
    // サーバーから強制取得（オフラインキャッシュをバイパス）
    const opts = { source: 'server' };

    // meta
    const metaSnap = await _userDoc(uid).get(opts);
    if (metaSnap.exists) {
      const meta = metaSnap.data();
      if (meta.settings          != null) _localSet(DB.K.settings,          meta.settings);
      if (meta.tutorial_cleared  != null) _localSet(DB.K.tutorial_cleared,  meta.tutorial_cleared);
      if (meta.unlocked          != null) _localSet(DB.K.unlocked,          meta.unlocked);
      if (meta.dismissed_suggest != null) _localSet(DB.K.dismissed_suggest, meta.dismissed_suggest);
      if (meta.title_shown       != null) _localSet(DB.K.title_shown,       meta.title_shown);
    }

    // tasks
    const tasksSnap = await _userCol(uid, 'tasks').get(opts);
    if (!tasksSnap.empty) {
      _localSet(DB.K.tasks, tasksSnap.docs.map(d => d.data()));
    }

    // logs
    const logsSnap = await _userCol(uid, 'logs').get(opts);
    if (!logsSnap.empty) {
      _localSet(DB.K.logs, logsSnap.docs.map(d => d.data()));
    }

    // period_days
    const periodsSnap = await _userCol(uid, 'period_days').get(opts);
    if (!periodsSnap.empty) {
      _localSet(DB.K.period_days, periodsSnap.docs.map(d => d.data()));
    }

    console.log('[DB] クラウドデータをダウンロードしました（サーバー取得）');
    return true;
  } catch (e) {
    console.error('[DB] ダウンロード失敗:', e);
    return false;
  }
}

// ----------------------------------------------------------------
// リアルタイム同期（Firestore → localStorage → 画面再描画）
// アプリが開いている間、他デバイスの変更を自動反映する
// ----------------------------------------------------------------
const _unsubscribers = [];

function startRealtimeSync(uid) {
  if (!_db || !uid) return;
  stopRealtimeSync(); // 二重登録を防ぐ

  // tasks の変化を監視
  _unsubscribers.push(
    _userCol(uid, 'tasks').onSnapshot(snap => {
      if (snap.metadata.hasPendingWrites) return; // 自分の書き込みは無視
      const tasks = snap.docs.map(d => d.data());
      DB.set(DB.K.tasks, tasks);
      renderCalendar?.();
      renderTaskList?.();
    }, err => console.warn('[Sync] tasks:', err))
  );

  // logs の変化を監視
  _unsubscribers.push(
    _userCol(uid, 'logs').onSnapshot(snap => {
      if (snap.metadata.hasPendingWrites) return;
      const logs = snap.docs.map(d => d.data());
      DB.set(DB.K.logs, logs);
      renderCalendar?.();
    }, err => console.warn('[Sync] logs:', err))
  );

  // period_days の変化を監視
  _unsubscribers.push(
    _userCol(uid, 'period_days').onSnapshot(snap => {
      if (snap.metadata.hasPendingWrites) return;
      const periods = snap.docs.map(d => d.data());
      DB.set(DB.K.period_days, periods);
      renderPeriod?.();
    }, err => console.warn('[Sync] period_days:', err))
  );

  // meta（設定等）の変化を監視
  _unsubscribers.push(
    _userDoc(uid).onSnapshot(snap => {
      if (snap.metadata.hasPendingWrites) return;
      if (!snap.exists) return;
      const meta = snap.data();
      if (meta.settings)                       DB.set(DB.K.settings, meta.settings);
      if (meta.unlocked)                       DB.set(DB.K.unlocked, meta.unlocked);
      if (meta.tutorial_cleared !== undefined) DB.set(DB.K.tutorial_cleared, meta.tutorial_cleared);
      if (meta.dismissed_suggest)             DB.set(DB.K.dismissed_suggest, meta.dismissed_suggest);
      if (meta.title_shown)                   DB.set(DB.K.title_shown, meta.title_shown);
      // tutorial_cleared が変わると画面表示が変わるため再描画
      renderCalendar?.();
    }, err => console.warn('[Sync] meta:', err))
  );

  console.log('[DB] リアルタイム同期を開始しました');
}

function stopRealtimeSync() {
  _unsubscribers.forEach(unsub => unsub());
  _unsubscribers.length = 0;
}

// ----------------------------------------------------------------
// DB拡張：Firestore への書き込みを DB.set に追加する
// app.js の DB.set を呼ぶたびに Firestore にも書き込む
// ----------------------------------------------------------------
function extendDBWithCloud() {
  const originalSet = DB.set.bind(DB);

  DB.set = function(k, v) {
    // 常に localStorage に書く（オフライン対応）
    originalSet(k, v);

    // Firebase 未設定 or 未ログイン時はスキップ
    if (!_db || !FIREBASE_CONFIGURED) return;
    const uid = getUserId?.();
    if (!uid) return;

    // キーに対応する Firestore の書き込みを実行（非同期・エラーは握りつぶす）
    _cloudWrite(uid, k, v).catch(e => console.warn('[DB] クラウド書き込み失敗:', e));
  };
}

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
      // meta ドキュメントへのマージ書き込み
      await _userDoc(uid).set(
        { [_metaField(k)]: v, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
      break;
  }
}

// コレクションを配列データで上書き同期（削除 + 書き込み）
async function _syncCollection(uid, col, items, idField) {
  const colRef = _userCol(uid, col);
  // 既存ドキュメントを取得して不要なものを削除
  const existing = await colRef.get();
  const existingIds = new Set(existing.docs.map(d => d.id));
  const newIds = new Set(items.map(i => String(i[idField])));

  const batch = _db.batch();
  // 削除（新配列に無いもの）
  existing.docs.forEach(doc => {
    if (!newIds.has(doc.id)) batch.delete(doc.ref);
  });
  // 追加・更新
  items.forEach(item => {
    batch.set(colRef.doc(String(item[idField])), item);
  });
  await batch.commit();
}

// DB.K のキー → meta フィールド名の変換
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

// 同一 UID で二重実行を防ぐフラグ
let _signingInUid = null;

async function onUserSignedIn(user) {
  if (!_db) return;
  const uid = user.uid;

  // 同一 UID での二重実行を防ぐ（匿名→Google 昇格後の二重呼び出し対策）
  if (_signingInUid === uid) return;
  _signingInUid = uid;

  showSyncStatus('同期中…');

  try {
    const hasCloud = await _checkCloudDataExists(uid);

    if (hasCloud) {
      // クラウドにデータあり → サーバーから強制ダウンロードして上書き
      const ok = await downloadCloudDataToLocal(uid);
      if (ok) showToast('同期できました！データを読み込みました');
      else    showToast('同期に失敗しました。再度お試しください');
    } else {
      // クラウドにデータなし → ローカルをアップロード
      await uploadLocalDataToCloud(uid);
      showToast('データをクラウドに保存しました');
    }
  } finally {
    _signingInUid = null;
    // リアルタイム同期を開始
    startRealtimeSync(uid);
    hideSyncStatus();
    // 画面を再描画
    renderCalendar?.();
    renderTaskList?.();
    renderPeriod?.();
    renderSettings?.();
  }
}

async function _checkCloudDataExists(uid) {
  try {
    // サーバーから強制取得してキャッシュの誤判定を防ぐ
    const snap = await _userCol(uid, 'tasks').limit(1).get({ source: 'server' });
    return !snap.empty;
  } catch {
    // サーバー取得失敗時はキャッシュで試みる
    try {
      const snap = await _userCol(uid, 'tasks').limit(1).get();
      return !snap.empty;
    } catch {
      return false;
    }
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

let _roomUnsub       = null;  // ルームドキュメントのリスナー解除関数
let _partnerPeriodUnsub = null; // パートナーの period_days リスナー解除関数
let _commentsUnsub   = null;  // コメントのリスナー解除関数

// ルームコレクションへの参照
function _roomRef(roomId) {
  return _db.collection('share_rooms').doc(roomId);
}
function _commentsRef(roomId) {
  return _db.collection('share_rooms').doc(roomId).collection('comments');
}

// ----------------------------------------------------------------
// ルーム作成（招待する側）
// ----------------------------------------------------------------
// 招待URLの有効期限（ミリ秒）: 72時間
const INVITE_EXPIRE_MS = 72 * 60 * 60 * 1000;

async function createShareRoom() {
  if (!_db) return { error: 'Firebase未設定' };
  const uid = getUserId?.();
  if (!uid) return { error: 'ログインが必要です' };
  // 匿名ユーザーは招待を作成できない
  if (isAnonymous?.()) return { error: 'パートナー共有にはアカウント登録が必要です' };

  try {
    const roomRef = _db.collection('share_rooms').doc(); // 自動ID
    // expiresAt: 72時間後のタイムスタンプ（Firestore ルール側でも検証可能）
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

// ----------------------------------------------------------------
// ルーム参加（招待されたパートナー側）
// ----------------------------------------------------------------
async function joinShareRoom(roomId) {
  if (!_db) return { error: 'Firebase未設定' };
  const uid = getUserId?.();
  if (!uid) return { error: 'ログインが必要です' };
  // 匿名ユーザーはパートナー接続不可（生理情報という要配慮個人情報のため実名認証必須）
  if (isAnonymous?.()) return { error: 'パートナー共有にはアカウント登録が必要です' };

  try {
    const snap = await _roomRef(roomId).get();
    if (!snap.exists) return { error: '招待リンクが無効です' };

    const room = snap.data();
    if (room.ownerUid === uid) return { error: '自分自身とは共有できません' };
    if (room.partnerUid && room.partnerUid !== uid) return { error: 'このルームは既に使用されています' };

    // 有効期限チェック（expiresAt が存在する場合のみ）
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

// ----------------------------------------------------------------
// 参加済みルームIDを取得（自分がオーナーまたはパートナー）
// ----------------------------------------------------------------
async function findMyRoom() {
  if (!_db) return null;
  const uid = getUserId?.();
  if (!uid) return null;

  try {
    // オーナーとして作成したルームを検索
    const ownerSnap = await _db.collection('share_rooms')
      .where('ownerUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (!ownerSnap.empty) return { id: ownerSnap.docs[0].id, ...ownerSnap.docs[0].data() };

    // パートナーとして参加したルームを検索
    const partnerSnap = await _db.collection('share_rooms')
      .where('partnerUid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (!partnerSnap.empty) return { id: partnerSnap.docs[0].id, ...partnerSnap.docs[0].data() };

    return null;
  } catch (e) {
    console.error('[Share] ルーム検索失敗:', e);
    return null;
  }
}

// ----------------------------------------------------------------
// ルームのリアルタイム監視（接続状態 + パートナーの period_days）
// ----------------------------------------------------------------
function startShareRoomSync(roomId, onRoomUpdate, onPartnerPeriodUpdate) {
  stopShareRoomSync();

  // ルームドキュメント（partnerUid の変化など）を監視
  _roomUnsub = _roomRef(roomId).onSnapshot(snap => {
    if (!snap.exists) return;
    onRoomUpdate?.(snap.data());

    // パートナーが確定したら period_days を監視開始
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
  _roomUnsub?.();         _roomUnsub = null;
  _partnerPeriodUnsub?.(); _partnerPeriodUnsub = null;
  _commentsUnsub?.();     _commentsUnsub = null;
}

// ----------------------------------------------------------------
// コメント
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// ルーム解除（どちらか一方がルームを抜ける）
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// プッシュ通知：パートナーに生理記録更新を通知する
// Firestoreの share_rooms/{roomId}/notifications に書き込み
// （Cloud Functions不使用：Web Push は VAPID が必要なため
//   ここでは Firestoreへの書き込みトリガーとして記録し、
//   受け取り側のリアルタイムリスナーで画面内通知を出す）
// ----------------------------------------------------------------
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

  // 自分宛ての通知（パートナーが書いたもの）を監視
  // 起動後の新着のみを受け取るため startAfter で現在時刻以降に限定
  const since = firebase.firestore.Timestamp.now();
  _db.collection('share_rooms').doc(roomId)
    .collection('notifications')
    .where('fromUid', '!=', uid)          // 自分が書いたものは除外
    .where('createdAt', '>=', since)
    .onSnapshot(snap => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          onNotify?.(change.doc.data());
        }
      });
    }, err => console.warn('[Share] notifications:', err));
}

