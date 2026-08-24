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
    // 【問題C修正】empty でも必ず _localSet する。
    // empty のままにすると initData() が書いた FIRST_TASK が残り、
    // 次の DB.set 時にクラウドへ意図せず書き込まれるのを防ぐ。
    const tasksSnap = await _userCol(uid, 'tasks').get(opts);
    _localSet(DB.K.tasks, tasksSnap.docs.map(d => d.data()));

    // logs（同様に空配列で上書きしてローカルの古いデータを排除）
    const logsSnap = await _userCol(uid, 'logs').get(opts);
    _localSet(DB.K.logs, logsSnap.docs.map(d => d.data()));

    // period_days（同様に空配列で上書き）
    const periodsSnap = await _userCol(uid, 'period_days').get(opts);
    _localSet(DB.K.period_days, periodsSnap.docs.map(d => d.data()));

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

// onSnapshot コールバック内で DB.set を呼ぶと extendDBWithCloud 経由で
// Firestore へ再書き込みが走り、それが再度 onSnapshot を発火させる
// 無限ループを防ぐため、リスナー内では localStorage へ直書きする専用関数を使う。
function _localSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}

function startRealtimeSync(uid) {
  if (!_db || !uid) return;
  stopRealtimeSync(); // 二重登録を防ぐ

  // 【問題B修正】
  // onSnapshot は登録直後に「初回コールバック」を発火する。
  // downloadCloudDataToLocal が { source:'server' } で取得した最新データを
  // localStorage に書いた直後にキャッシュベースの初回コールバックが上書きするのを防ぐため、
  // 最初の1回だけ _skipFirst フラグで各リスナーの初回コールバックをスキップする。
  let _skipFirst = { tasks: true, logs: true, period_days: true, meta: true };

  // tasks の変化を監視
  _unsubscribers.push(
    _userCol(uid, 'tasks').onSnapshot(snap => {
      if (_skipFirst.tasks) { _skipFirst.tasks = false; return; }
      if (snap.metadata.hasPendingWrites) return; // 自分の書き込みは無視
      _localSet(DB.K.tasks, snap.docs.map(d => d.data()));
      renderCalendar?.();
      renderTaskList?.();
    }, err => console.warn('[Sync] tasks:', err))
  );

  // logs の変化を監視
  _unsubscribers.push(
    _userCol(uid, 'logs').onSnapshot(snap => {
      if (_skipFirst.logs) { _skipFirst.logs = false; return; }
      if (snap.metadata.hasPendingWrites) return;
      _localSet(DB.K.logs, snap.docs.map(d => d.data()));
      renderCalendar?.();
    }, err => console.warn('[Sync] logs:', err))
  );

  // period_days の変化を監視
  _unsubscribers.push(
    _userCol(uid, 'period_days').onSnapshot(snap => {
      if (_skipFirst.period_days) { _skipFirst.period_days = false; return; }
      if (snap.metadata.hasPendingWrites) return;
      _localSet(DB.K.period_days, snap.docs.map(d => d.data()));
      renderPeriod?.();
    }, err => console.warn('[Sync] period_days:', err))
  );

  // meta（設定等）の変化を監視
  // 【問題D修正】serverTimestamp の解決により2回コールバックが発火する。
  // hasPendingWrites が false になる2回目で renderCalendar が余分に呼ばれるのを防ぐため、
  // フィールド値が実際に変化した場合のみ再描画する。
  _unsubscribers.push(
    _userDoc(uid).onSnapshot(snap => {
      if (_skipFirst.meta) { _skipFirst.meta = false; return; }
      if (snap.metadata.hasPendingWrites) return;
      if (!snap.exists) return;
      const meta = snap.data();
      let changed = false;
      const applyMeta = (key, storageKey) => {
        if (meta[key] == null) return;
        const prev = localStorage.getItem(storageKey);
        const next = JSON.stringify(meta[key]);
        if (prev !== next) { _localSet(storageKey, meta[key]); changed = true; }
      };
      applyMeta('settings',          DB.K.settings);
      applyMeta('unlocked',          DB.K.unlocked);
      applyMeta('tutorial_cleared',  DB.K.tutorial_cleared);
      applyMeta('dismissed_suggest', DB.K.dismissed_suggest);
      applyMeta('title_shown',       DB.K.title_shown);
      // 実際に値が変わった場合のみ再描画
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
// DB拡張：Firestore への書き込みを DB.set に追加する
// app.js の DB.set を呼ぶたびに Firestore にも書き込む
// ----------------------------------------------------------------
function extendDBWithCloud() {
  const originalSet = DB.set.bind(DB);

  DB.set = function(k, v) {
    // Firebase 未設定 / 未ログイン / 匿名ユーザー時はローカルのみ
    if (!_db || !FIREBASE_CONFIGURED || isAnonymous?.()) {
      originalSet(k, v);
      return;
    }
    const uid = getUserId?.();
    if (!uid) {
      originalSet(k, v);
      return;
    }

    // _diffItems は localStorage の「書き込み前」の値と比較するため、
    // Firestore への書き込みを先に起動してから localStorage を更新する。
    _cloudWrite(uid, k, v).catch(e => console.warn('[DB] クラウド書き込み失敗:', e));

    // localStorage への書き込み（Firestore 書き込み起動後）
    originalSet(k, v);
  };
}

// localStorage の現在値と比較して、削除されたIDと変更されたアイテムを特定するヘルパー
// 戻り値: { deletedIds: string[], changedItems: object[] }
// パース失敗時は deletedIds=null（呼び出し元でフォールバック処理）
function _diffItems(storageKey, newItems, idField) {
  try {
    const prev    = JSON.parse(localStorage.getItem(storageKey)) || [];
    const prevMap = new Map(prev.map(i => [String(i[idField]), JSON.stringify(i)]));
    const newSet  = new Set(newItems.map(i => String(i[idField])));

    const deletedIds   = prev.map(i => String(i[idField])).filter(id => !newSet.has(id));
    // 新規追加 or JSON が変化したアイテムのみ書き込む
    const changedItems = newItems.filter(i => {
      const id = String(i[idField]);
      return !prevMap.has(id) || prevMap.get(id) !== JSON.stringify(i);
    });

    return { deletedIds, changedItems };
  } catch {
    // パース失敗時: changedItems=全件 / deletedIds=null（全件 get() フォールバック）
    return { deletedIds: null, changedItems: newItems };
  }
}

async function _cloudWrite(uid, k, v) {
  switch (k) {
    case DB.K.tasks: {
      const { deletedIds, changedItems } = _diffItems(DB.K.tasks, v, 'id');
      await _syncCollection(uid, 'tasks', changedItems, 'id', deletedIds);
      break;
    }
    case DB.K.logs: {
      const { deletedIds, changedItems } = _diffItems(DB.K.logs, v, 'id');
      await _syncCollection(uid, 'logs', changedItems, 'id', deletedIds);
      break;
    }
    case DB.K.period_days: {
      const { deletedIds, changedItems } = _diffItems(DB.K.period_days, v, 'date');
      await _syncCollection(uid, 'period_days', changedItems, 'date', deletedIds);
      break;
    }
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
    case DB.K.partner:
      // partner はローカル管理専用。Firestore への書き込みは行わない。
      break;
  }
}

// コレクションを差分同期する
// - deletedIds: 削除対象のID配列。空配列なら削除なし。null なら全件 get() で差分を確認。
// - items: 追加・更新対象のアイテム（変更があったものだけ渡すこと）
async function _syncCollection(uid, col, items, idField, deletedIds = null) {
  const colRef = _userCol(uid, col);
  const batch  = _db.batch();

  if (deletedIds !== null) {
    // 削除対象が明示されている（空配列を含む）場合は全件 get() しない
    deletedIds.forEach(id => batch.delete(colRef.doc(String(id))));
  } else {
    // deletedIds が null（パース失敗）の場合のみ全件 get() で孤立ドキュメントを削除
    const existing = await colRef.get();
    // items が全件渡されている前提（_diffItems のフォールバックパスでは changedItems=全件）
    const newIds   = new Set(items.map(i => String(i[idField])));
    existing.docs.forEach(doc => {
      if (!newIds.has(doc.id)) batch.delete(doc.ref);
    });
  }

  // 変更があったアイテムのみ書き込む（items が空なら書き込みゼロ）
  items.forEach(item => {
    batch.set(colRef.doc(String(item[idField])), item);
  });

  // 書き込みも削除もなければ commit しない（無駄なリクエストを避ける）
  const hasOps = items.length > 0 || (deletedIds !== null ? deletedIds.length > 0 : true);
  if (hasOps) await batch.commit();
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

  // 【問題A修正】
  // 旧実装では finally でリアルタイム同期を開始していたため、
  // download 失敗時でも startRealtimeSync が走り、ダウンロード失敗の
  // UI 警告と実際の挙動が矛盾していた。
  // download / upload が完了した場合のみ startRealtimeSync を呼ぶよう変更。
  let syncReady = false;

  try {
    // null = 判定不能（通信失敗・クォータ超過など）
    // true  = Firestoreにデータあり
    // false = Firestoreにデータなし（初回登録ユーザー）
    const hasCloud = await _checkCloudDataExists(uid);

    if (hasCloud === null) {
      // 判定不能 → データ破壊リスクを避けるためアップロードもダウンロードもしない
      console.warn('[DB] クラウドデータ存在確認に失敗。同期をスキップします。');
      showToast('同期できませんでした。ネットワークをご確認ください');
      // syncReady = false のまま → startRealtimeSync しない
    } else if (hasCloud) {
      // クラウドにデータあり → サーバーから強制ダウンロードして上書き
      const ok = await downloadCloudDataToLocal(uid);
      if (ok) {
        showToast('同期できました！データを読み込みました');
        syncReady = true; // download 成功時のみ同期開始
      } else {
        showToast('同期に失敗しました。再度お試しください');
        // syncReady = false のまま → 古いキャッシュで onSnapshot を起動しない
      }
    } else {
      // クラウドにデータなし（確実に新規ユーザー）→ ローカルをアップロード
      await uploadLocalDataToCloud(uid);
      showToast('データをクラウドに保存しました');
      syncReady = true; // upload 成功時も同期開始
    }
  } catch (e) {
    console.error('[DB] onUserSignedIn 中にエラー:', e);
  } finally {
    _signingInUid = null;
    hideSyncStatus();
    if (syncReady) {
      // download/upload が成功した場合のみリアルタイム同期を開始する
      // （初回コールバックは startRealtimeSync 内の _skipFirst で無視される）
      startRealtimeSync(uid);
    }
    // 画面を再描画（syncReady に関わらず最新の localStorage を反映）
    renderCalendar?.();
    renderTaskList?.();
    renderPeriod?.();
    renderSettings?.();
  }
}

// Firestoreにそのユーザーのデータが存在するか確認する。
// 戻り値：
//   true  = データあり（ダウンロード優先）
//   false = データなし（アップロードしてよい）
//   null  = 判定不能（通信失敗・クォータ超過）→ 何もしない
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
      // 両方失敗 → 判定不能。false を返すとローカルデータでクラウドを上書きしてしまうため null を返す
      return null;
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

