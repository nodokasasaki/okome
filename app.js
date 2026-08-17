/* ================================================================
   おうちリズム — app.js  (Calendar-first redesign)
   ================================================================ */
'use strict';

// ----------------------------------------------------------------
// 1. ジャンル定義（SVGアイコン付き）
// ----------------------------------------------------------------
const GENRES = [
  {
    id: 'toilet', label: 'トイレ',
    color: '#4a90c4', bg: '#e0f0fa',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M7 3h10v4a5 5 0 01-10 0V3z"/>
      <path d="M9 7v2a3 3 0 006 0V7"/>
      <path d="M12 13v3M10 19h4M8 19a2 2 0 000 4h8a2 2 0 000-4"/>
    </svg>`,
  },
  {
    id: 'kitchen', label: 'キッチン',
    color: '#e8a020', bg: '#fef3d8',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M3 7h18M3 7v12a2 2 0 002 2h14a2 2 0 002-2V7"/>
      <path d="M8 7V4M16 7V4M8 12h8M8 16h5"/>
    </svg>`,
  },
  {
    id: 'bath', label: '浴室',
    color: '#3aada8', bg: '#e0f5f4',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M4 12h16v3a5 5 0 01-5 5H9a5 5 0 01-5-5v-3z"/>
      <path d="M6 12V6a2 2 0 012-2h1v3"/>
      <path d="M9 19v2M15 19v2"/>
    </svg>`,
  },
  {
    id: 'wash', label: '洗面台',
    color: '#8b72be', bg: '#ede9f8',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M6 18a6 6 0 0012 0V12H6v6z"/>
      <path d="M6 12H4a2 2 0 010-4h16a2 2 0 010 4h-2"/>
      <path d="M12 4v4M10 4l2-2 2 2"/>
    </svg>`,
  },
  {
    id: 'living', label: 'リビング',
    color: '#4caf7d', bg: '#d4f0e2',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M3 10V8a2 2 0 012-2h14a2 2 0 012 2v2"/>
      <path d="M3 10a2 2 0 000 4h18a2 2 0 000-4"/>
      <path d="M5 14v3M19 14v3M8 17h8"/>
    </svg>`,
  },
  {
    id: 'bedroom', label: '寝室',
    color: '#e07a5f', bg: '#fdeee9',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M2 20V8l10-5 10 5v12"/>
      <path d="M9 20v-6h6v6"/>
      <path d="M2 12h20"/>
    </svg>`,
  },
  {
    id: 'entrance', label: '玄関',
    color: '#6b7280', bg: '#f3f4f6',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="4" y="2" width="12" height="20" rx="1"/>
      <path d="M16 12h4M18 10l2 2-2 2"/>
      <circle cx="14" cy="12" r="1" fill="currentColor"/>
    </svg>`,
  },
  {
    id: 'window', label: '窓',
    color: '#3a8a5c', bg: '#d4f0e2',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 12h18M12 3v18"/>
    </svg>`,
  },
  {
    id: 'other', label: 'その他',
    color: '#9ca3af', bg: '#f9fafb',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 8v4l3 3"/>
    </svg>`,
  },
];

function getGenre(id) { return GENRES.find(g => g.id === id) || GENRES[GENRES.length - 1]; }

// ----------------------------------------------------------------
// 2. データ管理
// ----------------------------------------------------------------
const DB = {
  // period_days: { date:'2024-01-01', flow:'normal'|'light'|'heavy'|'none', symptoms:[], memo:'' }
  K: { tasks: 'or2_tasks', logs: 'or2_logs', period_days: 'or2_period_days', settings: 'or2_settings', partner: 'or2_partner', unlocked: 'or2_unlocked', dismissed_suggest: 'or2_dismissed_suggest', title_shown: 'or2_title_shown', tutorial_cleared: 'or2_tutorial_cleared' },
  get(k)       { try { return JSON.parse(localStorage.getItem(k)) || []; } catch { return []; } },
  getObj(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d;  } catch { return d; } },
  set(k, v)    { localStorage.setItem(k, JSON.stringify(v)); },
};

const DEFAULT_SETTINGS = { homeType:'1ldk', cleanLevel:'normal', cycleLength:28, periodLen:5 };

// 最初のタスクは「机の上を片付ける」1件のみ。
// クリア後にユーザー自身がタスクを追加できるようになる（アンロック）。
const FIRST_TASK = { name:'机の上を片付ける', genre:'living', cycle:'weekly', diff:'easy' };

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

// ファーストタスクが完了済みかどうか（ログに1件以上あるか、または一度クリアされたフラグがあるか）
function isFirstTaskCleared() {
  if (DB.getObj(DB.K.tutorial_cleared, false) === true) return true;
  const tasks = DB.get(DB.K.tasks);
  const first = tasks.find(t => t._isFirst);
  if (!first) return true; // データ構成が変わっていたら解放済み扱い
  const cleared = DB.get(DB.K.logs).some(l => l.taskId === first.id);
  if (cleared) {
    DB.set(DB.K.tutorial_cleared, true);
  }
  return cleared;
}

function initData() {
  if (!DB.get(DB.K.tasks).length) {
    DB.set(DB.K.tasks, [{
      id: uid(), ...FIRST_TASK, memo: '最初の一歩！まずここから始めよう。', lastDone: null,
      createdAt: new Date().toISOString(), _isFirst: true,
    }]);
  }
}

// ----------------------------------------------------------------
// 3. 日付ユーティリティ
// ----------------------------------------------------------------
const D = {
  today() { return new Date().toISOString().slice(0, 10); },
  addDays(s, n) {
    const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  },
  diff(a, b) { return Math.floor((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000); },
  jpShort(s) {
    const d = new Date(s + 'T00:00:00');
    return `${d.getMonth()+1}/${d.getDate()}`;
  },
  jpFull(s) {
    const d = new Date(s + 'T00:00:00');
    const wd = ['日','月','火','水','木','金','土'][d.getDay()];
    return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日（${wd}）`;
  },
  jpMonth(y, m) { return `${y}年<span>${m+1}月</span>`; },
};

// ----------------------------------------------------------------
// 4. タスクロジック
// ----------------------------------------------------------------
const CYCLE_DAYS = { none:0, daily:1, weekly:7, monthly:30, season:90, yearly:365 };
const CYCLE_LABELS = { none:'なし', daily:'毎日', weekly:'週1', monthly:'月1', season:'3ヶ月', yearly:'年1', custom:'カスタム' };
const CYCLE_PILL  = { none:'pill-custom', daily:'pill-daily', weekly:'pill-weekly', monthly:'pill-monthly', season:'pill-season', yearly:'pill-yearly', custom:'pill-custom' };
const DIFF_LABELS = { easy:'軽め', mid:'普通', hard:'重め' };

// タスクのサイクル日数を返す（custom は task.customDays を使用、none は単発タスク）
function getCycleDays(task) {
  if (task.cycle === 'custom') return Math.max(1, Number(task.customDays) || 1);
  if (task.cycle === 'none') return 99999; // 単発タスク：次回が遥か未来になるよう大きな値
  return CYCLE_DAYS[task.cycle] || 7;
}

// タスクの周期ラベルを返す
function getCycleLabel(task) {
  if (task.cycle === 'custom') return `${task.customDays || 1}日ごと`;
  return CYCLE_LABELS[task.cycle] || '';
}

function nextDue(task) {
  if (task.cycle === 'none') {
    // 単発タスク：lastDoneがあれば完了済みなので遠い未来、なければ今日
    return task.lastDone ? D.addDays(task.lastDone, 99999) : D.today();
  }
  if (!task.lastDone) return D.today();
  return D.addDays(task.lastDone, getCycleDays(task));
}

function daysUntilDue(task) { return D.diff(nextDue(task), D.today()); }  // negative = overdue

function completeTask(taskId, date) {
  const tasks = DB.get(DB.K.tasks);
  const i = tasks.findIndex(t => t.id === taskId);
  if (i === -1) return;
  tasks[i].lastDone = date;
  DB.set(DB.K.tasks, tasks);
  const logs = DB.get(DB.K.logs);
  logs.push({ id: uid(), taskId, completedAt: date });
  DB.set(DB.K.logs, logs);
}

function undoComplete(taskId, date) {
  const tasks = DB.get(DB.K.tasks);
  const i = tasks.findIndex(t => t.id === taskId);
  if (i === -1) return;
  const logs = DB.get(DB.K.logs);
  const stillHas = logs.find(l => l.taskId === taskId && l.completedAt === date);
  if (!stillHas) return;
  const newLogs = logs.filter(l => !(l.taskId === taskId && l.completedAt === date));
  DB.set(DB.K.logs, newLogs);
  // restore lastDone to previous log
  const prevLogs = newLogs.filter(l => l.taskId === taskId).sort((a,b) => b.completedAt.localeCompare(a.completedAt));
  tasks[i].lastDone = prevLogs.length ? prevLogs[0].completedAt : null;
  DB.set(DB.K.tasks, tasks);
}

// 指定日に完了済みかどうか
function isDoneOn(taskId, date) {
  return DB.get(DB.K.logs).some(l => l.taskId === taskId && l.completedAt === date);
}

// 指定日にdue（= nextDue <= date）かどうか
function isDueOn(task, date) {
  return nextDue(task) <= date;
}

// ----------------------------------------------------------------
// 5. 生理ロジック（日付ごと管理）
// ----------------------------------------------------------------

// 全生理日を日付文字列のSetで返す
function getPeriodDaySet() {
  const days = DB.get(DB.K.period_days);
  return new Set(days.map(d => d.date));
}

// 特定日の記録を返す（なければnull）
function getPeriodDay(date) {
  return DB.get(DB.K.period_days).find(d => d.date === date) || null;
}

// 生理日を保存（flowがnoneなら削除）
function setPeriodDay(date, flow, symptoms, memo) {
  let days = DB.get(DB.K.period_days);
  const idx = days.findIndex(d => d.date === date);
  if (flow === 'none' || !flow) {
    // 削除
    days = days.filter(d => d.date !== date);
  } else {
    const record = { date, flow, symptoms: symptoms || [], memo: memo || '' };
    if (idx >= 0) days[idx] = record;
    else days.push(record);
  }
  DB.set(DB.K.period_days, days);
}

// 生理日の連続区間を抽出 → [{start, end}] の配列
function getPeriodRanges() {
  const days = DB.get(DB.K.period_days)
    .map(d => d.date)
    .sort();
  if (!days.length) return [];
  const ranges = [];
  let start = days[0], prev = days[0];
  for (let i = 1; i < days.length; i++) {
    const gap = D.diff(days[i], prev);
    if (gap <= 2) { // 1〜2日の空白は同一周期とみなす
      prev = days[i];
    } else {
      ranges.push({ start, end: prev });
      start = days[i]; prev = days[i];
    }
  }
  ranges.push({ start, end: prev });
  return ranges;
}

// 平均周期長を計算（最大6回分のデータを使用）
function getAvgCycleLength() {
  const ranges = getPeriodRanges();
  const s = DB.getObj(DB.K.settings, DEFAULT_SETTINGS);
  const defaultLen = Number(s.cycleLength) || 28;
  if (ranges.length < 2) return defaultLen;
  const diffs = [];
  for (let i = 0; i < Math.min(ranges.length - 1, 6); i++) {
    diffs.push(D.diff(ranges[i+1].start, ranges[i].start));
  }
  return Math.round(diffs.reduce((a,b)=>a+b,0)/diffs.length);
}

// 次回・次々回の生理予測日を返す { next, nextNext, avg, count }
function getPeriodPrediction() {
  const ranges = getPeriodRanges();
  if (!ranges.length) return null;
  const avg = getAvgCycleLength();
  const lastStart = ranges[ranges.length - 1].start;
  const next     = D.addDays(lastStart, avg);
  const nextNext = D.addDays(lastStart, avg * 2);
  return { next, nextNext, avg, count: ranges.length };
}

// 後方互換：単一の次回予測日を返す（カレンダードット用）
function getNextPeriodDate() {
  const pred = getPeriodPrediction();
  return pred ? pred.next : null;
}

// 現在のフェーズ
function getCurrentPhase() {
  const ranges = getPeriodRanges();
  if (!ranges.length) return null;
  const latest = ranges[ranges.length - 1];
  const s = DB.getObj(DB.K.settings, DEFAULT_SETTINGS);
  const cycleLen = Number(s.cycleLength) || 28;
  const day = D.diff(D.today(), latest.start) + 1;
  if (day < 1 || day > cycleLen + 7) return null;
  const periodLen = D.diff(latest.end, latest.start) + 1;
  if (day <= periodLen) return { phase:'menstrual',  label:'生理期',  day, color:'#d96b6b' };
  if (day <= Math.floor(cycleLen/2)-2) return { phase:'follicular', label:'卵胞期', day, color:'#e8a020' };
  if (day <= Math.floor(cycleLen/2)+2) return { phase:'ovulation',  label:'排卵期', day, color:'#4caf7d' };
  return { phase:'luteal', label:'黄体期', day, color:'#8b72be' };
}

// ----------------------------------------------------------------
// 5b. パートナー共有（Firestoreルームベース）
// ----------------------------------------------------------------

// 現在接続中のルーム状態（インメモリ）
let _shareRoom = null;          // { id, ownerUid, partnerUid }
let _partnerPeriodDays = [];    // パートナーの生理記録（リアルタイム）
let _roomComments = [];         // コメント一覧（リアルタイム）

// 招待URL生成（ルームIDをURLパラメータに埋め込む）
function buildInviteURL(roomId) {
  return `${location.href.split('?')[0]}?room=${roomId}`;
}

// ルーム接続開始（ルームが確定したら同期開始）
function _attachRoom(room) {
  _shareRoom = room;
  DB.set(DB.K.partner, { roomId: room.id }); // roomIdだけ永続化

  startShareRoomSync(
    room.id,
    // ルーム状態変化コールバック
    updatedRoom => {
      _shareRoom = { ..._shareRoom, ...updatedRoom };
      renderShareModalState?.();
      renderPeriod?.();
    },
    // パートナーのperiod_days変化コールバック
    days => {
      _partnerPeriodDays = days;
      renderPeriod?.();
    }
  );

  listenComments(room.id, comments => {
    _roomComments = comments;
    renderShareComments?.();
  });

  listenPartnerNotifications(room.id, notif => {
    if (notif.type === 'period_updated') {
      showToast('パートナーが生理記録を更新しました');
      showBrowserNotification('パートナーが生理記録を更新しました', 'おうちリズム');
    }
  });
}

// 招待リンクを作成してURLを返す
async function createInviteLink() {
  const result = await createShareRoom();
  if (result.error) return result;
  const room = { id: result.roomId, ownerUid: getUserId(), partnerUid: null };
  _attachRoom(room);
  return { ok: true, url: buildInviteURL(result.roomId) };
}

// 招待URLを踏んだ側の処理
async function acceptInvite(roomId) {
  const result = await joinShareRoom(roomId);
  if (result.error) return result;
  const room = { id: roomId, ...result.room };
  _attachRoom(room);
  return { ok: true };
}

function getPartnerData() {
  return _shareRoom && _partnerPeriodDays.length
    ? { roomId: _shareRoom.id, period_days: _partnerPeriodDays, sharedAt: D.today() }
    : null;
}

function getShareRoomId() {
  return _shareRoom?.id || null;
}

function isPartnerConnected() {
  return !!(_shareRoom?.ownerUid && _shareRoom?.partnerUid);
}

// 生理記録更新時にパートナーへ通知（app.js の記録保存処理から呼ぶ）
async function onPeriodUpdated() {
  const roomId = getShareRoomId();
  if (!roomId || !isPartnerConnected()) return;
  await notifyPartnerPeriodUpdate(roomId);
}

// 起動時にURLパラメータを自動チェック（room= または 旧 share=）
function checkShareURLOnLoad() {
  const params = new URLSearchParams(location.search);

  // 新方式：?room=<roomId>
  const roomId = params.get('room');
  if (roomId) {
    history.replaceState(null, '', location.pathname);
    onAuthReady(async user => {
      if (!user) {
        // ログインが必要 → 認証モーダルを出してからもう一度実行
        openAuthModal('login');
        const _retry = setInterval(async () => {
          if (!getUserId()) return;
          clearInterval(_retry);
          const result = await acceptInvite(roomId);
          if (result.ok) {
            showToast('パートナーと接続しました！');
            renderPeriod?.();
          } else {
            showToast(result.error || '招待リンクが無効です');
          }
        }, 800);
        return;
      }
      const result = await acceptInvite(roomId);
      if (result.ok) {
        showToast('パートナーと接続しました！');
        renderPeriod?.();
      } else {
        showToast(result.error || '招待リンクが無効です');
      }
    });
    return;
  }

  // 起動時に既存ルームを復元
  onAuthReady(async user => {
    if (!user) return;
    const saved = DB.getObj(DB.K.partner, null);
    if (!saved?.roomId) return;
    try {
      const snap = await _db?.collection('share_rooms').doc(saved.roomId).get();
      if (!snap?.exists) { DB.set(DB.K.partner, null); return; }
      const room = { id: saved.roomId, ...snap.data() };
      _attachRoom(room);
    } catch (e) {
      console.warn('[Share] ルーム復元失敗:', e);
    }
  });
}

// ----------------------------------------------------------------
// 6. カレンダー描画
// ----------------------------------------------------------------
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calSelectedDate = D.today();
let calGenreFilter = 'all';   // 'all' or genre id

function renderCalendar() {
  const tasks   = DB.get(DB.K.tasks);
  const logs    = DB.get(DB.K.logs);
  const today   = D.today();
  const cleared = isFirstTaskCleared();

  // --- Month label + 称号バッジ（コンパクト）---
  document.getElementById('cal-month-label').innerHTML = D.jpMonth(calYear, calMonth);
  const calTitleEl = document.getElementById('cal-title-badge');
  if (calTitleEl) calTitleEl.innerHTML = buildTitleBadgeHtml(true);

  // --- Genre tabs: ファーストタスク完了後のみ表示 ---
  const tabsEl = document.getElementById('genre-tabs');
  if (cleared) {
    tabsEl.innerHTML = [{ id:'all', label:'すべて', color:'#4caf7d', bg:'#d4f0e2', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>` }, ...GENRES]
      .map(g => `
        <button class="genre-tab ${calGenreFilter === g.id ? 'active' : ''}" data-genre="${g.id}"
          style="${calGenreFilter === g.id ? `background:${g.color};border-color:${g.color};` : `border-color:${g.bg};`}">
          <svg class="genre-icon" viewBox="0 0 24 24" fill="none" stroke="${calGenreFilter === g.id ? '#fff' : g.color}" stroke-width="1.8">${g.icon.replace(/<svg[^>]*>/, '').replace('</svg>', '')}</svg>
          ${g.label}
        </button>`)
      .join('');
  } else {
    tabsEl.innerHTML = '';
  }

  // --- Weekdays ---
  document.getElementById('cal-weekdays').innerHTML =
    ['日','月','火','水','木','金','土'].map((w,i) =>
      `<div class="cal-wd ${i===0?'sun':i===6?'sat':''}">${w}</div>`
    ).join('');

  // --- Build task-due day map: date -> [{task, done}] ---
  const monthStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}`;
  const monthStart = `${monthStr}-01`;
  const monthEnd   = `${monthStr}-${String(new Date(calYear, calMonth+1, 0).getDate()).padStart(2,'0')}`;

  // filter tasks by genre
  const filteredTasks = calGenreFilter === 'all' ? tasks : tasks.filter(t => t.genre === calGenreFilter);

  // date -> Set of genre colors
  // ループ上限を設けて無限ループを防ぐ
  const dateDots = {};
  const cycleDays_limit = 500; // 最大ループ回数
  filteredTasks.forEach(t => {
    const due = nextDue(t);
    const cycleD = getCycleDays(t);
    const color  = getGenre(t.genre).color;

    // monthStart〜monthEnd の各日が due から cycleD の倍数日後かチェック
    // 直接計算：monthStart からの日差が cycleD の倍数になる日を列挙
    const diffToStart = D.diff(monthStart, due); // due -> monthStart の差（負=dueが未来）
    // dueがmonthEndより未来ならスキップ
    if (due > monthEnd) return;

    // dueがmonthStartより前の場合、最初の該当日を計算
    let firstInMonth;
    if (due <= monthStart) {
      const rem = ((-diffToStart) % cycleD + cycleD) % cycleD;
      firstInMonth = rem === 0 ? monthStart : D.addDays(monthStart, rem === 0 ? 0 : cycleD - rem);
      // 再計算: dueからの差がcycleDの倍数になる最初のmonthStart以降の日
      const daysFromDue = D.diff(monthStart, due); // monthStart - due (正=dueが過去)
      const mod = daysFromDue % cycleD;
      firstInMonth = mod === 0 ? monthStart : D.addDays(monthStart, cycleD - mod);
    } else {
      firstInMonth = due;
    }

    // firstInMonth から cycleD ずつ monthEnd まで追加（上限あり）
    let cur = firstInMonth;
    let safety = 0;
    while (cur <= monthEnd && safety < cycleDays_limit) {
      if (!dateDots[cur]) dateDots[cur] = new Set();
      dateDots[cur].add(color);
      cur = D.addDays(cur, cycleD);
      safety++;
    }
  });

  // --- Render days ---
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const lastDate = new Date(calYear, calMonth + 1, 0).getDate();
  const prevLast = new Date(calYear, calMonth, 0).getDate();

  let html = '';
  let count = 0;

  // prev month
  for (let i = firstDay - 1; i >= 0; i--) {
    const prevMonth = calMonth === 0 ? 12 : calMonth;
    const prevYear  = calMonth === 0 ? calYear - 1 : calYear;
    const ds = `${prevYear}-${String(prevMonth).padStart(2,'0')}-${String(prevLast - i).padStart(2,'0')}`;
    html += `<div class="cal-day other-month" data-date="${ds}">${prevLast - i}</div>`;
    count++;
  }

  // current month
  for (let d = 1; d <= lastDate; d++) {
    const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let cls = 'cal-day';
    if (ds === today)             cls += ' today';
    if (ds === calSelectedDate && ds !== today) cls += ' selected';

    const dots = dateDots[ds];
    let dotHtml = '';
    if (dots && dots.size) {
      const colors = [...dots].slice(0, 3);
      dotHtml = `<div class="cal-day-dots">${colors.map(c => `<div class="cal-dot" style="background:${c}"></div>`).join('')}</div>`;
    }
    html += `<div class="${cls}" data-date="${ds}">${d}${dotHtml}</div>`;
    count++;
  }

  // next month fill
  let nm = 1;
  while (count % 7 !== 0) {
    const nextMonth = calMonth === 11 ? 1 : calMonth + 2;
    const nextYear  = calMonth === 11 ? calYear + 1 : calYear;
    const ds = `${nextYear}-${String(nextMonth).padStart(2,'0')}-${String(nm).padStart(2,'0')}`;
    html += `<div class="cal-day other-month" data-date="${ds}">${nm}</div>`;
    nm++; count++;
  }

  document.getElementById('cal-days').innerHTML = html;
  renderDayPanel(calSelectedDate);
}

// --- Day panel ---
// ----------------------------------------------------------------
// 5c. カレンダー検索
// ----------------------------------------------------------------
function renderCalSearchResults(q) {
  const el = document.getElementById('cal-search-results');
  if (!el) return;

  const query = q.toLowerCase();
  const tasks = DB.get(DB.K.tasks);
  const logs  = DB.get(DB.K.logs);
  const today = D.today();

  // ① タスク名・ジャンルラベルでマッチするタスクを探す
  const matchedTasks = tasks.filter(t => {
    const g = getGenre(t.genre);
    return t.name.toLowerCase().includes(query) ||
           g.label.toLowerCase().includes(query);
  });

  if (!matchedTasks.length) {
    el.innerHTML = `
      <div class="cal-search-empty">
        「${_escapeHtml(q)}」に一致するタスクはありません
        <div class="cal-search-empty-sub">タスク名やジャンル（キッチン・浴室など）で検索できます</div>
      </div>`;
    return;
  }

  // ② 完了ログ（新しい順・タスクごと最大4件）
  const doneRows = [];
  matchedTasks.forEach(t => {
    const g = getGenre(t.genre);
    logs
      .filter(l => l.taskId === t.id)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(0, 4)
      .forEach(l => {
        doneRows.push({ date: l.completedAt, taskName: t.name, genre: g, type: 'done' });
      });
  });
  // 最新完了を先頭に
  doneRows.sort((a, b) => b.date.localeCompare(a.date));

  // ③ 次回予定日（近い順・タスクごと最大2件）
  const upcomingRows = [];
  matchedTasks.forEach(t => {
    const g      = getGenre(t.genre);
    const cycleD = getCycleDays(t);
    let cur = nextDue(t);
    while (cur < today) cur = D.addDays(cur, cycleD);
    for (let i = 0; i < 2; i++) {
      upcomingRows.push({ date: cur, taskName: t.name, genre: g, type: 'upcoming' });
      cur = D.addDays(cur, cycleD);
    }
  });
  upcomingRows.sort((a, b) => a.date.localeCompare(b.date));

  // ④ 完了優先で結合（完了が先、予定が後）上限20件
  const sections = [];
  if (doneRows.length) {
    sections.push({ label: '完了履歴', rows: doneRows.slice(0, 12) });
  }
  if (upcomingRows.length) {
    sections.push({ label: '次回予定', rows: upcomingRows.slice(0, 6) });
  }

  el.innerHTML = sections.map(sec => `
    <div class="cal-search-section-header">${sec.label}</div>
    ${sec.rows.map(r => {
      const isDone  = r.type === 'done';
      const isToday = r.date === today;
      const dateStr = isToday ? '今日' : D.jpFull(r.date);
      const checkSvg = isDone
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" width="13" height="13"><path d="M5 13l4 4L19 7"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="color:var(--muted)"><path d="M9 18l6-6-6-6"/></svg>`;
      return `
      <div class="cal-search-row ${isDone ? 'is-done' : ''}" data-search-date="${r.date}">
        <div class="cal-search-row-icon" style="background:${r.genre.bg};">
          <svg viewBox="0 0 24 24" fill="none" stroke="${r.genre.color}" stroke-width="1.8" width="18" height="18">${r.genre.icon.replace(/<svg[^>]*>/,'').replace('</svg>','')}</svg>
        </div>
        <div class="cal-search-row-body">
          <div class="cal-search-row-name ${isDone ? 'is-done-text' : ''}">${_escapeHtml(r.taskName)}</div>
          <div class="cal-search-row-meta">
            <span class="cal-search-row-date">${dateStr}</span>
            <span class="pill ${isDone ? 'pill-weekly' : 'pill-custom'}" style="${isDone ? 'background:var(--g200);color:var(--g700);' : 'background:var(--amber-lt);color:var(--amber);'}">${isDone ? '完了' : '予定'}</span>
          </div>
        </div>
        <div class="cal-search-row-check ${isDone ? 'done' : 'upcoming'}">${checkSvg}</div>
      </div>`;
    }).join('')}
  `).join('');
}

function renderDayPanel(date) {
  const cleared = isFirstTaskCleared();
  const dayPanel = document.querySelector('.day-panel');

  // ファーストタスク未完了時はウェルカムパネルを表示してリストは非表示
  if (!cleared) {
    dayPanel.style.display = 'none';
    const welcomeEl = document.getElementById('cal-welcome-panel');
    if (welcomeEl) {
      const tasks   = DB.get(DB.K.tasks);
      const first   = tasks.find(t => t._isFirst);
      const isDone  = first ? isDoneOn(first.id, D.today()) : false;
      welcomeEl.style.display = '';
      welcomeEl.innerHTML = `
        <div class="welcome-step">
          <div class="welcome-step-icon">
            <svg viewBox="0 0 40 40" width="40" height="40" fill="none">
              <rect width="40" height="40" rx="20" fill="#d4f0e2"/>
              <path d="M12 20h16M12 14h16M12 26h10" stroke="#2d6a46" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </div>
          <div class="welcome-step-body">
            <div class="welcome-step-title">ステップ 1：最初のタスクをこなそう</div>
            <div class="welcome-step-desc">「机の上を片付ける」を完了すると、<br>自分のタスクを追加できるようになるよ！</div>
            ${first ? `
            <div class="welcome-first-task ${isDone ? 'done' : ''}"
                 data-task-id="${first.id}" data-date="${D.today()}">
              <div class="day-task-icon" style="background:#d4f0e2;">
                <svg viewBox="0 0 24 24" fill="none" stroke="#4caf7d" stroke-width="1.8">
                  <path d="M3 10V8a2 2 0 012-2h14a2 2 0 012 2v2"/><path d="M3 10a2 2 0 000 4h18a2 2 0 000-4"/><path d="M5 14v3M19 14v3M8 17h8"/>
                </svg>
              </div>
              <div class="day-task-body">
                <div class="day-task-name ${isDone ? 'done-text' : ''}">机の上を片付ける</div>
                <div class="day-task-sub">リビング・週1・軽め</div>
              </div>
              <div class="day-task-check ${isDone ? 'done' : ''}">
                ${isDone ? `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg>` : ''}
              </div>
            </div>` : ''}
          </div>
        </div>`;
    }
    return;
  }

  // ファーストタスク完了後：通常のDayパネル表示
  dayPanel.style.display = '';
  const welcomeEl = document.getElementById('cal-welcome-panel');
  if (welcomeEl) welcomeEl.style.display = 'none';

  // 日付ラベルを同期（day-panel-date-top: DayPanel内ヘッダー、setup-banner-date: バナー内）
  const dayPanelDateTop = document.getElementById('day-panel-date-top');
  if (dayPanelDateTop) dayPanelDateTop.textContent = D.jpFull(date);
  const setupDateEl = document.getElementById('setup-banner-date');
  if (setupDateEl) setupDateEl.textContent = D.jpFull(date);

  const tasks  = DB.get(DB.K.tasks);

  // タスクがファーストタスクのみ（1件以下）の場合、設定促進バナーを表示
  const setupBannerEl = document.getElementById('cal-setup-banner');
  const onlyFirstTask = tasks.length <= 1 && (tasks.length === 0 || tasks[0]._isFirst);
  if (setupBannerEl) {
    if (onlyFirstTask) {
      setupBannerEl.style.display = '';
      dayPanel.style.display = 'none';  // バナー表示中はday-panelを隠す
    } else {
      setupBannerEl.style.display = 'none';
      dayPanel.style.display = '';
    }
  }

  const filteredTasks = calGenreFilter === 'all' ? tasks : tasks.filter(t => t.genre === calGenreFilter);

  // tasks due on this date
  const dueTasks = filteredTasks.filter(t => {
    const due = nextDue(t);
    if (due > date) return false;
    const d = D.diff(date, due);
    return d >= 0 && d % getCycleDays(t) === 0;
  });

  const noTaskBanner = document.getElementById('cal-no-task-suggest');
  const listEl = document.getElementById('day-task-list');
  if (dueTasks.length === 0) {
    if (noTaskBanner) noTaskBanner.style.display = '';
    listEl.innerHTML = '';
    return;
  }
  if (noTaskBanner) noTaskBanner.style.display = 'none';

  listEl.innerHTML = dueTasks.map(t => {
    const g    = getGenre(t.genre);
    const done = isDoneOn(t.id, date);
    return `
    <div class="day-task-card ${done ? 'done' : ''}" data-task-id="${t.id}" data-date="${date}">
      <div class="day-task-icon" style="background:${g.bg};">
        <svg viewBox="0 0 24 24" fill="none" stroke="${g.color}" stroke-width="1.8">${g.icon.replace(/<svg[^>]*>/,'').replace('</svg>','')}</svg>
      </div>
      <div class="day-task-body">
        <div class="day-task-name ${done ? 'done-text' : ''}">${t.name}</div>
        <div class="day-task-sub">${g.label}・<span class="pill ${CYCLE_PILL[t.cycle] || 'pill-custom'}">${getCycleLabel(t)}</span>・${DIFF_LABELS[t.diff]}</div>
      </div>
      <div class="day-task-check ${done ? 'done' : ''}">
        ${done ? `<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M5 13l4 4L19 7"/></svg>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ----------------------------------------------------------------
// 7. タスクリスト描画
// ----------------------------------------------------------------
let taskGenreFilter = 'all';

// ----------------------------------------------------------------
// 7a. AI提案エンジン（ルールベース）
// ----------------------------------------------------------------
// ユーザーのタスク構成・周期を分析して次に追加すべきタスクを提案する。
// 実際のAI API呼び出しは行わず、ルールに基づいてローカルで計算する。

// 提案候補マスタ（全ジャンルを網羅した候補リスト）
const SUGGESTION_MASTER = [
  // キッチン系
  { name:'シンクを磨く',         genre:'kitchen',  cycle:'daily',   diff:'easy', reason:'毎日使うシンクは日次のケアで清潔を保てます' },
  { name:'コンロ周りを拭く',     genre:'kitchen',  cycle:'daily',   diff:'easy', reason:'油汚れは毎日拭くと固まらず楽に落とせます' },
  { name:'電子レンジ内を拭く',   genre:'kitchen',  cycle:'monthly', diff:'easy', reason:'月1回の内部清掃で臭いを防げます' },
  { name:'冷蔵庫の外を拭く',     genre:'kitchen',  cycle:'monthly', diff:'easy', reason:'指紋・汚れが溜まりやすい箇所です' },
  { name:'冷蔵庫内を整理する',   genre:'kitchen',  cycle:'monthly', diff:'mid',  reason:'食品ロス防止と衛生管理のため月1がおすすめです' },
  { name:'換気扇フィルターを掃除する', genre:'kitchen', cycle:'season', diff:'hard', reason:'換気効率維持と火災予防のため3ヶ月に1回が目安です' },
  // トイレ系
  { name:'トイレ全体を掃除する', genre:'toilet',   cycle:'weekly',  diff:'mid',  reason:'週1回の掃除で清潔な状態を保てます' },
  { name:'トイレタンクを拭く',   genre:'toilet',   cycle:'monthly', diff:'easy', reason:'見落としがちな箇所ですが月1で十分です' },
  // 浴室系
  { name:'浴槽を洗う',           genre:'bath',     cycle:'daily',   diff:'easy', reason:'毎日使うのでその都度さっと洗うのが効果的です' },
  { name:'浴室の床を磨く',       genre:'bath',     cycle:'weekly',  diff:'mid',  reason:'週1回で黒ずみ・カビを予防できます' },
  { name:'排水口のぬめり取り',   genre:'bath',     cycle:'monthly', diff:'mid',  reason:'月1回のケアで詰まり・臭いを防げます' },
  { name:'浴室換気扇を掃除する', genre:'bath',     cycle:'season',  diff:'mid',  reason:'3ヶ月に1回でカビ胞子の拡散を防げます' },
  // 洗面台
  { name:'洗面台を磨く',         genre:'wash',     cycle:'weekly',  diff:'easy', reason:'鏡の水垢・蛇口の汚れは週1でリセットを' },
  { name:'洗濯槽を洗う',         genre:'wash',     cycle:'monthly', diff:'mid',  reason:'月1回の槽洗浄で洗濯物の清潔さが保たれます' },
  // リビング系
  { name:'掃除機をかける',       genre:'living',   cycle:'weekly',  diff:'mid',  reason:'週1の掃除機がけでホコリ・アレルゲンを除去できます' },
  { name:'床を水拭きする',       genre:'living',   cycle:'monthly', diff:'mid',  reason:'掃除機と組み合わせると床の清潔度が上がります' },
  { name:'ソファを拭く',         genre:'living',   cycle:'monthly', diff:'easy', reason:'皮脂汚れが蓄積しやすいので月1でケアしましょう' },
  { name:'エアコンフィルターを掃除する', genre:'living', cycle:'season', diff:'hard', reason:'3ヶ月に1回で電力節約と空気清浄効果を維持できます' },
  { name:'照明器具のホコリを取る', genre:'living', cycle:'season',  diff:'easy', reason:'3ヶ月に1回で室内の明るさを保てます' },
  // 寝室
  { name:'枕カバーを替える',     genre:'bedroom',  cycle:'weekly',  diff:'easy', reason:'肌に触れる枕カバーは週1交換が衛生的です' },
  { name:'ベッド周りを掃除する', genre:'bedroom',  cycle:'weekly',  diff:'easy', reason:'ホコリは寝具に溜まりやすいです' },
  { name:'クローゼットを整理する', genre:'bedroom', cycle:'season', diff:'hard', reason:'季節の変わり目に整理するのがおすすめです' },
  // 玄関
  { name:'玄関を掃き掃除する',   genre:'entrance', cycle:'weekly',  diff:'easy', reason:'外から持ち込むホコリ・砂を週1で除去しましょう' },
  { name:'玄関タイルを磨く',     genre:'entrance', cycle:'monthly', diff:'easy', reason:'月1で見た目も清潔感もアップします' },
  // 窓・ベランダ
  { name:'窓ガラスを拭く',       genre:'window',   cycle:'season',  diff:'hard', reason:'季節ごとの窓拭きで部屋の採光が改善します' },
  { name:'ベランダを掃き掃除する', genre:'window',  cycle:'monthly', diff:'easy', reason:'花粉・枯れ葉が溜まりやすいので月1がおすすめです' },
  // その他
  { name:'ゴミをまとめる',       genre:'other',    cycle:'daily',   diff:'easy', reason:'毎日のゴミ整理で部屋がスッキリ保てます' },
  { name:'ドアノブ・スイッチを拭く', genre:'other', cycle:'weekly', diff:'easy', reason:'手が触れる箇所は雑菌が多いです。週1で清潔に' },
];

/**
 * AIタスク提案を生成する（ルールベース）
 * ユーザーのタスク構成・周期を分析して最大5件の提案を返す。
 * @returns {Array<{name, genre, cycle, diff, reason, score}>}
 */
function generateTaskSuggestions() {
  const tasks    = DB.get(DB.K.tasks);
  const settings = DB.getObj(DB.K.settings, DEFAULT_SETTINGS);
  // dismissed_suggest は [{name, count}] の配列。却下回数が多いほど優先度ペナルティ。
  const dismissed = DB.get(DB.K.dismissed_suggest);
  const dismissedMap = Object.fromEntries(dismissed.map(d => [d.name, d.count || 1]));

  const existingNames = new Set(tasks.map(t => t.name));
  const existingGenres = tasks.reduce((acc, t) => {
    acc[t.genre] = (acc[t.genre] || 0) + 1;
    return acc;
  }, {});

  // 住居タイプに応じた推奨ジャンル優先度
  const homeBoost = {
    '1k':   { kitchen:3, toilet:3, living:2 },
    '1ldk': { kitchen:3, toilet:3, bath:2, living:2 },
    '2ldk': { kitchen:2, toilet:2, bath:2, living:2, bedroom:1 },
    '3ldk': { kitchen:2, toilet:2, bath:2, living:2, bedroom:2, entrance:1, window:1 },
  }[settings.homeType] || {};

  // 掃除レベルに応じた周期フィルタ
  const cycleWeights = {
    light:  { daily:1, weekly:3, monthly:2, season:1, yearly:0 },
    normal: { daily:2, weekly:3, monthly:3, season:2, yearly:1 },
    strict: { daily:3, weekly:3, monthly:3, season:2, yearly:2 },
  }[settings.cleanLevel] || { daily:2, weekly:3, monthly:3, season:2, yearly:1 };

  const scored = SUGGESTION_MASTER
    .filter(s => !existingNames.has(s.name))  // すでに登録済みは除外
    .map(s => {
      let score = 0;
      // ジャンルが少ない（未着手）ほど優先
      const genreCount = existingGenres[s.genre] || 0;
      if (genreCount === 0) score += 5;
      else if (genreCount === 1) score += 2;
      // 住居タイプによるブースト
      score += (homeBoost[s.genre] || 0);
      // 周期の適合度
      score += (cycleWeights[s.cycle] || 0);
      // 却下回数ペナルティ（却下するたびに -3 ずつ下がる。スコアがマイナスになっても表示対象に残す）
      const dCount = dismissedMap[s.name] || 0;
      score -= dCount * 3;
      return { ...s, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return scored;
}

// ----------------------------------------------------------------
// 7b. スコア・称号システム
// ----------------------------------------------------------------

/**
 * AI難易度推定：タスクごとに0.5〜3.0のスコア係数を返す。
 *
 * ユーザーが設定した diff（easy/mid/hard）はあくまで「本人の感覚」であり
 * 実際の労力とズレることがある。そこで以下の要素を組み合わせて
 * ユーザーごとに異なるスコア重みを算出する：
 *
 *   1. ユーザー設定 diff をベース係数に変換（easy=1.0, mid=1.8, hard=2.8）
 *   2. 周期が長いほど「こなした達成感」が大きいとして加算
 *      (daily +0.0, weekly +0.1, monthly +0.3, season +0.5, yearly +0.8)
 *   3. タスク名キーワードで補正（「換気扇」「エアコン」「クローゼット」等は重め）
 *   4. ジャンルによる微補正（bath/window は手間がかかりやすい）
 *   5. 合計を 0.5〜3.5 にクランプして返す
 */
function estimateTaskScore(task) {
  if (!task) return 1;

  // 1. ベース：ユーザー設定難易度
  const diffBase = { easy: 1.0, mid: 1.8, hard: 2.8 }[task.diff] || 1.0;

  // 2. 周期加算
  const cycleBonus = { daily: 0.0, weekly: 0.1, monthly: 0.3, season: 0.5, yearly: 0.8 }[task.cycle] || 0.1;

  // 3. タスク名キーワード補正
  const name = task.name || '';
  let nameBonus = 0;
  const heavyKeywords = ['換気扇', 'エアコン', 'フィルター', 'クローゼット', '押し入れ', '洗濯槽', '浴室換気', 'レンジフード', '冷蔵庫内'];
  const lightKeywords = ['拭く', 'まとめる', '片付ける', '替える', '磨く'];
  if (heavyKeywords.some(k => name.includes(k))) nameBonus += 0.4;
  else if (lightKeywords.some(k => name.includes(k))) nameBonus -= 0.1;

  // 4. ジャンル補正
  const genreBonus = { bath: 0.15, window: 0.15, kitchen: 0.1, bedroom: 0.05 }[task.genre] || 0;

  // 5. 合計をクランプ
  const raw = diffBase + cycleBonus + nameBonus + genreBonus;
  return Math.max(0.5, Math.min(3.5, Math.round(raw * 10) / 10));
}

// タスク完了ログからプレイヤースコアを計算する
// 各タスクの重みは estimateTaskScore() で計算（ユーザーごとに異なる）
function calcTotalScore() {
  const logs  = DB.get(DB.K.logs);
  const tasks = DB.get(DB.K.tasks);
  const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));
  return logs.reduce((sum, l) => {
    const t = taskMap[l.taskId];
    return sum + estimateTaskScore(t);
  }, 0);
}

// 称号テーブル（スコア閾値順）
// icon は innerHTML に渡すSVG文字列（絵文字不使用）
const TITLE_TABLE = [
  {
    score:  0, id: 't00', label: 'おうちの見習い', color: '#9ca3af', bg: '#f9fafb',
    desc: 'さあ、おうちリズムをはじめよう！',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#9ca3af" stroke-width="1.8"/>
      <path d="M12 8v4l2 2" stroke="#9ca3af" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`,
  },
  {
    score:  5, id: 't01', label: 'そうじのたまご', color: '#4caf7d', bg: '#eaf8f1',
    desc: '最初の一歩を踏み出したね！',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
      <ellipse cx="12" cy="13" rx="7" ry="8" stroke="#4caf7d" stroke-width="1.8"/>
      <path d="M9 13l2 2 4-4" stroke="#4caf7d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    score: 15, id: 't02', label: 'きれいずき初段', color: '#4a90c4', bg: '#e0f0fa',
    desc: '習慣が少しずつ身についてきたよ。',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
      <path d="M12 3l1.8 5.5H20l-4.9 3.6 1.8 5.5L12 14.1l-4.9 3.5 1.8-5.5L4 8.5h6.2z" stroke="#4a90c4" stroke-width="1.6" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    score: 30, id: 't03', label: 'おそうじ見習い', color: '#8b72be', bg: '#ede9f8',
    desc: 'こつこつ続けているね、えらい！',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
      <path d="M6 20l2-6 10-10a1.4 1.4 0 012 2L10 16l-4 4z" stroke="#8b72be" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M14 6l4 4" stroke="#8b72be" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`,
  },
  {
    score: 55, id: 't04', label: '掃除スタンダード', color: '#e8a020', bg: '#fef3d8',
    desc: '安定した掃除リズムができてきた！',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.1L12 17l-6.2 4-2.4 0 2.4-7.1L0 9.4h7.6z" stroke="#e8a020" stroke-width="1.6" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    score: 90, id: 't05', label: 'クリーンマスター', color: '#e07a5f', bg: '#fdeee9',
    desc: 'お部屋がいつもピカピカだね！',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#e07a5f" stroke-width="1.8"/>
      <path d="M8 12l3 3 5-6" stroke="#e07a5f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    score: 140, id: 't06', label: 'きれい人キング', color: '#e8a020', bg: '#fef3d8',
    desc: '掃除の達人！みんなの憧れ！',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
      <path d="M3 10l3 8h12l3-8-4.5 3L12 5 7.5 13z" stroke="#e8a020" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    score: 200, id: 't07', label: 'ハウスクリーン賢者', color: '#3aada8', bg: '#e0f5f4',
    desc: 'もはや掃除は生き方そのもの。',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
      <path d="M6 3l3 6h6l3-6" stroke="#3aada8" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M9 9v12M15 9v12M6 21h12" stroke="#3aada8" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`,
  },
  {
    score: 280, id: 't08', label: 'おうちの守り神', color: '#4caf7d', bg: '#d4f0e2',
    desc: '家中が輝いている。伝説的な存在！',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
      <path d="M3 11l9-8 9 8v9a1 1 0 01-1 1H4a1 1 0 01-1-1z" stroke="#4caf7d" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M9 21V13h6v8" stroke="#4caf7d" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>`,
  },
  {
    score: 400, id: 't09', label: '清潔の神様', color: '#8b72be', bg: '#ede9f8',
    desc: 'これ以上ない。完璧なおうちリズム！',
    icon: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none">
      <circle cx="12" cy="12" r="9" stroke="#8b72be" stroke-width="1.8"/>
      <path d="M12 3v18M3 12h18" stroke="#8b72be" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>
      <path d="M12 7l1.5 4.5H18l-3.7 2.7 1.5 4.3L12 16l-3.8 2.5 1.5-4.3L6 11.5h4.5z" stroke="#8b72be" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`,
  },
];

// 現在の称号オブジェクトを返す
function getCurrentTitle() {
  const score = calcTotalScore();
  let title = TITLE_TABLE[0];
  for (const t of TITLE_TABLE) {
    if (score >= t.score) title = t;
  }
  return { ...title, score };
}

// 次の称号オブジェクト（最高位なら null）を返す
function getNextTitle() {
  const score = calcTotalScore();
  return TITLE_TABLE.find(t => t.score > score) || null;
}

// 未通知の新称号があれば返す（通知済みIDはlocalStorageに保存）
function checkNewTitle() {
  const score     = calcTotalScore();
  const shown     = DB.get(DB.K.title_shown); // 通知済みIDの配列
  // スコアを満たしていて通知していないものを探す
  return TITLE_TABLE.find(t => score >= t.score && !shown.includes(t.id)) || null;
}

// 称号通知済みとしてマーク
function markTitleShown(id) {
  const shown = DB.get(DB.K.title_shown);
  if (!shown.includes(id)) {
    shown.push(id);
    DB.set(DB.K.title_shown, shown);
  }
}

// 称号バッジHTML（インライン用）
function buildTitleBadgeHtml(compact = false) {
  const t = getCurrentTitle();
  const score = calcTotalScore();
  if (compact) {
    // コンパクト版：SVGアイコン + ラベルのみ
    return `<span class="title-badge-compact" style="background:${t.bg};color:${t.color};">
      ${t.icon}<span class="title-badge-compact-label">${t.label}</span>
    </span>`;
  }
  const next = getNextTitle();
  const scoreInt = Math.floor(score);
  const progressPct = next
    ? Math.min(100, Math.round(((score - t.score) / (next.score - t.score)) * 100))
    : 100;
  const remainPt = next ? Math.ceil(next.score - score) : 0;
  return `
    <div class="title-badge-wrap">
      <div class="title-badge" style="background:${t.bg};color:${t.color};">
        <span class="title-badge-icon">${t.icon}</span>
        <span class="title-badge-label">${t.label}</span>
        <span class="title-badge-score">${scoreInt}pt</span>
      </div>
      ${next ? `
      <div class="title-progress-wrap">
        <div class="title-progress-bar" style="width:${progressPct}%;background:${t.color};"></div>
      </div>
      <div class="title-progress-label">次の称号「${next.label}」まで あと ${remainPt}pt</div>
      ` : `<div class="title-progress-label" style="color:${t.color};">最高称号！素晴らしい！</div>`}
    </div>`;
}

// 称号UP通知モーダルを表示（iconはSVGなので innerHTML で設定）
function showTitleModal(titleObj) {
  markTitleShown(titleObj.id);
  document.getElementById('title-modal-icon').innerHTML  = titleObj.icon;
  document.getElementById('title-modal-label').textContent = titleObj.label;
  document.getElementById('title-modal-desc').textContent  = titleObj.desc;
  document.getElementById('title-modal-score').textContent = `${titleObj.score}pt 達成！`;
  document.getElementById('modal-title-up').classList.remove('hidden');
}

// タスク完了後に呼ぶ：新称号チェック＆通知
function checkAndShowNewTitle() {
  const newTitle = checkNewTitle();
  if (newTitle) showTitleModal(newTitle);
}

/**
 * AI提案カードのHTML文字列を生成する（再利用可能なヘルパー）
 */
function buildSuggestHtml(suggestions) {
  return `
    <div class="suggest-section">
      <div class="suggest-header">
        <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
          <circle cx="10" cy="10" r="8" fill="#fef3d8"/>
          <path d="M10 6v4l2.5 2.5" stroke="#e8a020" stroke-width="1.8" stroke-linecap="round"/>
          <circle cx="10" cy="10" r="1" fill="#e8a020"/>
        </svg>
        <span>かくさんからの提案</span>
        <span class="suggest-header-sub">あなたのタスク構成を分析しました</span>
      </div>
      ${suggestions.map(s => {
        const g = getGenre(s.genre);
        return `
        <div class="suggest-card" data-sname="${s.name}" data-sgenre="${s.genre}" data-scycle="${s.cycle}" data-sdiff="${s.diff}">
          <div class="task-item-icon" style="background:${g.bg};">
            <svg viewBox="0 0 24 24" fill="none" stroke="${g.color}" stroke-width="1.8">${g.icon.replace(/<svg[^>]*>/,'').replace('</svg>','')}</svg>
          </div>
          <div class="suggest-card-body">
            <div class="suggest-card-name">${s.name}</div>
            <div class="suggest-card-meta">
              <span class="pill ${CYCLE_PILL[s.cycle] || 'pill-custom'}">${getCycleLabel(s)}</span>
              <span style="font-size:11px;color:var(--muted);">${DIFF_LABELS[s.diff]}</span>
            </div>
            <div class="suggest-card-reason">${s.reason}</div>
          </div>
          <div class="suggest-card-actions">
            <button class="suggest-add-btn" data-sname="${s.name}" data-sgenre="${s.genre}" data-scycle="${s.cycle}" data-sdiff="${s.diff}">追加</button>
            <button class="suggest-dismiss-btn" data-sname="${s.name}">×</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderTaskList() {
  const tasks = DB.get(DB.K.tasks);
  const today = D.today();
  const cleared = isFirstTaskCleared();
  const taskMap = Object.fromEntries(tasks.map(t => [t.id, t]));

  // ファーストタスク未完了時はロック画面を表示
  const bodyEl = document.getElementById('task-list-body');
  if (!cleared) {
    const barEl = document.getElementById('task-genre-bar');
    barEl.innerHTML = '';
    document.getElementById('tasks-sub').textContent = '';
    const pcSub2 = document.getElementById('tasks-sub-pc');
    if (pcSub2) pcSub2.textContent = '';
    document.getElementById('btn-add-task').style.display = 'none';
    const pcBtn = document.getElementById('btn-add-task-pc');
    if (pcBtn) pcBtn.style.display = 'none';
    bodyEl.innerHTML = `
      <div class="tasks-locked">
        <svg viewBox="0 0 64 64" width="64" height="64" fill="none">
          <rect width="64" height="64" rx="32" fill="#eaf8f1"/>
          <rect x="20" y="28" width="24" height="18" rx="4" fill="#a8dfc0"/>
          <path d="M24 28v-6a8 8 0 0116 0v6" stroke="#2d6a46" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="32" cy="37" r="2.5" fill="#2d6a46"/>
        </svg>
        <div class="tasks-locked-title">タスクはまだロック中です</div>
        <div class="tasks-locked-desc">カレンダー画面の「机の上を片付ける」を<br>完了すると解放されます！</div>
      </div>`;
    return;
  }

  // 解放後は通常表示（FABはswitchScreen/renderTaskList末尾で制御）

  // count + 称号バッジ
  const dueCount = tasks.filter(t => daysUntilDue(t) <= 0).length;
  const subText = `全${tasks.length}件 / 今日期限${dueCount}件`;
  document.getElementById('tasks-sub').textContent = subText;
  const pcSub2 = document.getElementById('tasks-sub-pc');
  if (pcSub2) pcSub2.textContent = subText;
  // タスク画面内の称号エリア
  const taskTitleEl = document.getElementById('tasks-title-badge');
  if (taskTitleEl) taskTitleEl.innerHTML = buildTitleBadgeHtml(false);

  // genre bar
  const barEl = document.getElementById('task-genre-bar');
  barEl.innerHTML = [{ id:'all', label:'すべて', color:'#4caf7d', bg:'#d4f0e2' }, ...GENRES].map(g =>
    `<button class="genre-tab ${taskGenreFilter === g.id ? 'active' : ''}" data-tgenre="${g.id}"
      style="${taskGenreFilter === g.id ? `background:${g.color};border-color:${g.color};` : `border-color:${g.bg};`}">
      ${g.label}
    </button>`
  ).join('');

  // filter
  const shown = taskGenreFilter === 'all' ? tasks : tasks.filter(t => t.genre === taskGenreFilter);

  let emptyHtml = '';
  if (!shown.length) {
    emptyHtml = `<div class="empty-state">
      <svg class="empty-illo" viewBox="0 0 96 96" fill="none">
        <circle cx="48" cy="48" r="44" fill="#eaf8f1"/>
        <rect x="28" y="30" width="40" height="40" rx="8" fill="#d4f0e2"/>
        <path d="M36 48h24M36 56h16" stroke="#4caf7d" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M36 40h24" stroke="#4caf7d" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
      <div>タスクがありません</div>
    </div>`;
    // AI提案だけは表示するためreturnしない
  }

  // タスクなしの場合は空ステートを出して提案へ進む
  if (emptyHtml) {
    let suggestHtml = '';
    if (taskGenreFilter === 'all') {
      const suggestions = generateTaskSuggestions();
      if (suggestions.length > 0) {
        suggestHtml = buildSuggestHtml(suggestions);
      }
    }
    bodyEl.innerHTML = emptyHtml + suggestHtml;
    return;
  }

  // group by genre
  const genreOrder = GENRES.map(g => g.id);
  const grouped = {};
  shown.forEach(t => {
    if (!grouped[t.genre]) grouped[t.genre] = [];
    grouped[t.genre].push(t);
  });

  // sort within group: overdue first
  Object.values(grouped).forEach(arr => arr.sort((a,b) => daysUntilDue(a) - daysUntilDue(b)));

  const sections = (taskGenreFilter === 'all' ? genreOrder : [taskGenreFilter])
    .filter(gid => grouped[gid])
    .map(gid => {
      const g  = getGenre(gid);
      const ts = grouped[gid];
      return `
      <div class="task-genre-section">
        <div class="task-genre-header">
          <div class="task-genre-header-icon" style="background:${g.bg};">
            <svg viewBox="0 0 24 24" fill="none" stroke="${g.color}" stroke-width="1.8">${g.icon.replace(/<svg[^>]*>/,'').replace('</svg>','')}</svg>
          </div>
          <div class="task-genre-title">${g.label}</div>
          <div class="task-genre-count">${ts.length}件</div>
        </div>
        ${ts.map(t => {
          const due  = daysUntilDue(t);
          let nextCls = 'ok', nextTxt = '';
          if (t.cycle === 'none') { nextCls = t.lastDone ? 'ok' : 'soon'; nextTxt = t.lastDone ? '完了済み' : '未完了'; }
          else if (due < 0)  { nextCls = 'overdue'; nextTxt = `${Math.abs(due)}日超過`; }
          else if (due === 0) { nextCls = 'overdue'; nextTxt = `今日期限`; }
          else if (due <= 3)  { nextCls = 'soon';    nextTxt = `あと${due}日`; }
          else               { nextCls = 'ok';      nextTxt = `次回 ${D.jpShort(nextDue(t))}`; }
          return `
          <div class="task-item" data-tid="${t.id}" data-edit="${t.id}" style="cursor:pointer;">
            <div class="task-item-icon" style="background:${g.bg};">
              <svg viewBox="0 0 24 24" fill="none" stroke="${g.color}" stroke-width="1.8">${g.icon.replace(/<svg[^>]*>/,'').replace('</svg>','')}</svg>
            </div>
            <div class="task-item-body">
              <div class="task-item-name">${t.name}</div>
              <div class="task-item-meta">
                <span class="pill ${CYCLE_PILL[t.cycle] || 'pill-custom'}">${getCycleLabel(t)}</span>
                <span>${DIFF_LABELS[t.diff] || ''}</span>
                <span class="task-item-next ${nextCls}">${nextTxt}</span>
              </div>
            </div>
            <div class="task-item-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 18l6-6-6-6"/></svg>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="divider-bar"></div>`;
    }).join('');

  // 今日完了したタスク一覧セクション
  let todayDoneHtml = '';
  if (taskGenreFilter === 'all') {
    const logs = DB.get(DB.K.logs);
    const todayLogs = logs.filter(l => l.completedAt === today);
    if (todayLogs.length > 0) {
      const doneItems = todayLogs.map(l => {
        const t = taskMap[l.taskId];
        if (!t) return '';
        const g = getGenre(t.genre);
        return `
        <div class="today-done-item">
          <div class="today-done-icon" style="background:${g.bg};">
            <svg viewBox="0 0 24 24" fill="none" stroke="${g.color}" stroke-width="1.8" width="14" height="14">${g.icon.replace(/<svg[^>]*>/,'').replace('</svg>','')}</svg>
          </div>
          <div class="today-done-name">${t.name}</div>
          <div class="today-done-check">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" width="11" height="11"><path d="M5 13l4 4L19 7"/></svg>
          </div>
        </div>`;
      }).filter(Boolean).join('');

      todayDoneHtml = `
      <div class="today-done-section">
        <div class="today-done-header">
          <svg viewBox="0 0 20 20" width="16" height="16" fill="none">
            <circle cx="10" cy="10" r="8" fill="#d4f0e2"/>
            <path d="M6 10l3 3 5-5" stroke="#2d6a46" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span>今日こなしたタスク</span>
          <span class="today-done-count">${todayLogs.length}件</span>
        </div>
        ${doneItems}
      </div>
      <div class="divider-bar"></div>`;
    }
  }

  // AI提案カードを末尾に追加（すべて表示時のみ・タスク数5件未満でも常時表示）
  let suggestHtml = '';
  if (taskGenreFilter === 'all') {
    const suggestions = generateTaskSuggestions();
    if (suggestions.length > 0) {
      suggestHtml = buildSuggestHtml(suggestions);
    }
  }

  bodyEl.innerHTML = todayDoneHtml + sections + suggestHtml;

  // FABはタスク画面のときのみ表示
  const fab = document.getElementById('btn-add-task');
  if (fab) fab.style.display = cleared ? '' : 'none';
}

// ----------------------------------------------------------------
// 8. 生理画面
// ----------------------------------------------------------------
const FLOW_JP   = { light:'少ない', normal:'普通', heavy:'多い' };
const FLOW_DOT  = { light:'#f9a8d4', normal:'#d96b6b', heavy:'#991b1b' };
const SYMP_JP   = { stomachache:'腹痛', headache:'頭痛', fatigue:'だるさ', swelling:'むくみ', mood:'気分の落ち込み', none:'なし' };

// ミニカレンダーの年月（生理画面用）
let periodCalYear  = new Date().getFullYear();
let periodCalMonth = new Date().getMonth();

function renderPeriodCal() {
  const periodSet  = getPeriodDaySet();
  const pred       = getPeriodPrediction();
  const s          = DB.getObj(DB.K.settings, DEFAULT_SETTINGS);
  const periodLen  = Number(s.periodLen) || 5;
  const today      = D.today();

  // 予測日セット
  const predSet = new Set();
  if (pred) {
    for (let i = 0; i < periodLen; i++) {
      const d = D.addDays(pred.next, i);
      if (!periodSet.has(d)) predSet.add(d);
    }
    // 次々回も
    for (let i = 0; i < periodLen; i++) {
      const d = D.addDays(pred.nextNext, i);
      if (!periodSet.has(d)) predSet.add(d);
    }
  }

  // ヘッダー
  document.getElementById('period-cal-month-label').innerHTML = D.jpMonth(periodCalYear, periodCalMonth);

  // 曜日
  document.getElementById('period-cal-weekdays').innerHTML =
    ['日','月','火','水','木','金','土'].map((w,i) =>
      `<div class="cal-wd ${i===0?'sun':i===6?'sat':''}">${w}</div>`
    ).join('');

  // 日付グリッド
  const firstDay = new Date(periodCalYear, periodCalMonth, 1).getDay();
  const lastDate = new Date(periodCalYear, periodCalMonth + 1, 0).getDate();
  const prevLast = new Date(periodCalYear, periodCalMonth, 0).getDate();
  const monthStr = `${periodCalYear}-${String(periodCalMonth+1).padStart(2,'0')}`;

  let html = '';
  let count = 0;

  // 前月
  for (let i = firstDay - 1; i >= 0; i--) {
    const pm = periodCalMonth === 0 ? 12 : periodCalMonth;
    const py = periodCalMonth === 0 ? periodCalYear - 1 : periodCalYear;
    const ds = `${py}-${String(pm).padStart(2,'0')}-${String(prevLast-i).padStart(2,'0')}`;
    html += `<div class="cal-day other-month" data-pdate="${ds}">${prevLast-i}</div>`;
    count++;
  }

  // 当月
  for (let d = 1; d <= lastDate; d++) {
    const ds = `${monthStr}-${String(d).padStart(2,'0')}`;
    let cls = 'cal-day';
    if (ds === today)         cls += ' today';
    if (periodSet.has(ds))   cls += ' period-day';
    else if (predSet.has(ds)) cls += ' period-pred';
    html += `<div class="${cls}" data-pdate="${ds}">${d}</div>`;
    count++;
  }

  // 翌月
  let nm = 1;
  while (count % 7 !== 0) {
    const nm2 = periodCalMonth === 11 ? 1 : periodCalMonth + 2;
    const ny  = periodCalMonth === 11 ? periodCalYear + 1 : periodCalYear;
    const ds  = `${ny}-${String(nm2).padStart(2,'0')}-${String(nm).padStart(2,'0')}`;
    html += `<div class="cal-day other-month" data-pdate="${ds}">${nm}</div>`;
    nm++; count++;
  }

  document.getElementById('period-cal-days').innerHTML = html;
}

function renderPeriod() {
  const phase  = getCurrentPhase();
  const pred   = getPeriodPrediction();
  const ranges = getPeriodRanges();
  const today  = D.today();

  // --- Hero ---
  if (phase) {
    document.getElementById('period-phase-label').textContent = phase.label;
    document.getElementById('period-day-label').textContent   = `周期 ${phase.day} 日目`;
  } else {
    document.getElementById('period-phase-label').textContent = ranges.length ? '非生理期' : '未記録';
    document.getElementById('period-day-label').textContent   = ranges.length
      ? `最終生理: ${D.jpShort(ranges[ranges.length-1].start)}`
      : '＋ボタンで記録しよう';
  }

  if (pred) {
    const daysToNext = D.diff(pred.next, today);
    let nextTxt;
    if (daysToNext < 0)       nextTxt = `次回予定日を${Math.abs(daysToNext)}日超過`;
    else if (daysToNext === 0) nextTxt = '次回予定日：今日';
    else if (daysToNext <= 7)  nextTxt = `次回まであと ${daysToNext} 日（${D.jpShort(pred.next)}）`;
    else                       nextTxt = `次回予定日: ${D.jpFull(pred.next)}`;
    document.getElementById('period-next-label').textContent = nextTxt;
  } else {
    document.getElementById('period-next-label').textContent = '記録を追加すると予測が表示されます';
  }

  // --- 周期サマリーカード（フェーズカード含む） ---
  const cardsEl = document.getElementById('period-summary-cards');
  if (pred) {
    const daysToNext = D.diff(pred.next, today);
    const cardStyle = 'flex:1;min-width:100px;background:var(--white);border:1.5px solid var(--border);border-radius:14px;padding:10px 12px;';

    // フェーズカード
    const phaseColors = { menstrual:'#d96b6b', follicular:'#e8a020', ovulation:'#4caf7d', luteal:'#8b72be' };
    const phaseColor  = phase ? (phaseColors[phase.phase] || 'var(--muted)') : 'var(--muted)';
    const phaseCardStyle = `flex:1;min-width:100px;background:${phase ? phaseColor : 'var(--surface)'};border:1.5px solid ${phase ? phaseColor : 'var(--border)'};border-radius:14px;padding:10px 12px;`;
    const phaseCard = `
      <div style="${phaseCardStyle}">
        <div style="font-size:10px;color:${phase ? 'rgba(255,255,255,.8)' : 'var(--muted)'};font-weight:700;margin-bottom:4px;">今日のフェーズ</div>
        <div style="font-size:16px;font-weight:800;color:${phase ? '#fff' : 'var(--muted)'};">${phase ? phase.label : '---'}</div>
        <div style="font-size:10px;color:${phase ? 'rgba(255,255,255,.8)' : 'var(--muted)'};margin-top:2px;">${phase ? `周期${phase.day}日目` : '記録が少ない'}</div>
      </div>`;

    cardsEl.innerHTML = phaseCard + `
      <div style="${cardStyle}">
        <div style="font-size:10px;color:var(--muted);font-weight:700;margin-bottom:4px;">平均周期</div>
        <div style="font-size:20px;font-weight:800;color:var(--rose);">${pred.avg}<span style="font-size:11px;font-weight:600;">日</span></div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px;">${pred.count}回の記録</div>
      </div>
      <div style="${cardStyle}">
        <div style="font-size:10px;color:var(--muted);font-weight:700;margin-bottom:4px;">次回予測</div>
        <div style="font-size:16px;font-weight:800;color:var(--rose);">${D.jpShort(pred.next)}</div>
        <div style="font-size:10px;color:${daysToNext <= 3 ? 'var(--rose)' : 'var(--muted)'};margin-top:2px;font-weight:${daysToNext<=3?'700':'400'};">${daysToNext < 0 ? `${Math.abs(daysToNext)}日超過` : daysToNext === 0 ? '今日' : `あと${daysToNext}日`}</div>
      </div>`;
  } else {
    cardsEl.innerHTML = '';
  }

  // --- 記録一覧 ---
  const allDays = DB.get(DB.K.period_days).sort((a,b) => b.date.localeCompare(a.date));
  const logEl = document.getElementById('period-log-list');

  // パートナービュー（接続中のみ表示）
  const connected = isPartnerConnected();
  const partnerSection = connected ? (
    _partnerPeriodDays.length ? `
    <div class="partner-period-section">
      <div class="partner-period-header">
        <span class="partner-dot"></span>
        パートナーの記録（リアルタイム同期中）
      </div>
      <div class="partner-period-days">
        ${_partnerPeriodDays
          .sort((a,b) => b.date.localeCompare(a.date))
          .slice(0, 10)
          .map(p => `<div class="partner-period-item">
            <span style="width:9px;height:9px;border-radius:50%;background:${FLOW_DOT[p.flow]||'#d96b6b'};flex-shrink:0;display:inline-block;"></span>
            <span class="partner-period-date">${D.jpShort(p.date)}</span>
            <span class="partner-period-flow">${FLOW_JP[p.flow]||'-'}</span>
            ${p.memo ? `<span class="partner-period-memo">${_escapeHtml(p.memo)}</span>` : ''}
          </div>`).join('')}
      </div>
    </div>` : `
    <div class="partner-period-section">
      <div class="partner-period-header">
        <span class="partner-dot"></span>パートナーの記録（リアルタイム同期中）
      </div>
      <div style="font-size:12px;color:var(--muted);padding:6px 0;">パートナーの記録はまだありません</div>
    </div>`
  ) : '';

  if (!allDays.length) {
    logEl.innerHTML = partnerSection + `<div class="empty-state" style="padding:16px 0 8px;">
      <div style="font-size:13px;color:var(--muted);">上のカレンダーの日付をタップして<br>生理日を記録しましょう</div>
    </div>`;
    renderPeriodCal();
    return;
  }

  logEl.innerHTML = partnerSection + allDays.slice(0, 60).map(p => `
    <div class="period-log-item" style="cursor:pointer;" data-log-date="${p.date}">
      <div class="period-log-date" style="display:flex;align-items:center;gap:6px;">
        <span style="width:10px;height:10px;border-radius:50%;background:${FLOW_DOT[p.flow]||'#d96b6b'};flex-shrink:0;display:inline-block;"></span>
        ${D.jpShort(p.date)}
      </div>
      <div class="period-log-body">
        ${FLOW_JP[p.flow]||'-'}
        ${p.symptoms?.length ? ' · ' + p.symptoms.map(s=>SYMP_JP[s]||s).join('・') : ''}
        ${p.memo ? `<br><span style="color:var(--muted);font-size:11px;">${p.memo}</span>` : ''}
      </div>
      <button class="period-log-del" data-del-date="${p.date}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
        </svg>
      </button>
    </div>`).join('');
  renderPeriodCal();
}

// ----------------------------------------------------------------
// 9. 設定画面
// ----------------------------------------------------------------
function renderSettings() {
  const s = DB.getObj(DB.K.settings, DEFAULT_SETTINGS);
  document.getElementById('setting-home-type').value   = s.homeType    || '1ldk';
  document.getElementById('setting-clean-level').value = s.cleanLevel  || 'normal';
  document.getElementById('setting-cycle').value        = s.cycleLength || 28;
  document.getElementById('setting-period-len').value   = s.periodLen   || 5;
}

function saveSettings() {
  DB.set(DB.K.settings, {
    homeType:    document.getElementById('setting-home-type').value,
    cleanLevel:  document.getElementById('setting-clean-level').value,
    cycleLength: Number(document.getElementById('setting-cycle').value),
    periodLen:   Number(document.getElementById('setting-period-len').value),
  });
  showToast('設定を保存しました');
}

// ----------------------------------------------------------------
// 10. モーダル
// ----------------------------------------------------------------
let editingTaskId = null;

// タスク名からジャンルを自動推定するキーワードマップ
const GENRE_KEYWORDS = {
  toilet:   ['トイレ', '便器', '便座', 'タンク', '洗浄'],
  kitchen:  ['キッチン', 'シンク', 'コンロ', '電子レンジ', 'レンジ', '冷蔵庫', '換気扇', '調理', 'レンジフード'],
  bath:     ['浴室', '浴槽', 'お風呂', 'バス', '風呂', '排水口', '鏡'],
  wash:     ['洗面台', '洗面', '洗濯', '洗濯槽', '洗い'],
  living:   ['リビング', '掃除機', '床', 'ソファ', 'テレビ', 'エアコン', '照明', 'カーペット'],
  bedroom:  ['寝室', '枕', 'ベッド', 'クローゼット', '押し入れ', '布団'],
  entrance: ['玄関', '靴', '下駄箱', '玄関タイル', 'ドアノブ'],
  window:   ['窓', 'ガラス', 'ベランダ', 'カーテン', 'ブラインド'],
};

function guessGenre(name) {
  const n = name.toLowerCase();
  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    if (keywords.some(k => n.includes(k.toLowerCase()))) return genre;
  }
  return null;
}

function openTaskModal(taskId = null) {
  editingTaskId = taskId;
  document.getElementById('modal-task-title-text').textContent = taskId ? 'タスクを編集' : 'タスクを追加';
  document.getElementById('btn-delete-task').style.display = taskId ? '' : 'none';
  if (taskId) {
    const t = DB.get(DB.K.tasks).find(t => t.id === taskId);
    if (!t) return;
    document.getElementById('input-task-name').value  = t.name;
    document.getElementById('input-task-genre').value = t.genre;
    document.getElementById('input-task-memo').value  = t.memo || '';
    setRadio('input-task-cycle', t.cycle || 'weekly');
    setRadio('input-task-diff',  t.diff  || 'easy');
    document.getElementById('input-custom-days').value = t.customDays || 3;
    document.getElementById('custom-days-row').style.display = t.cycle === 'custom' ? 'flex' : 'none';
  } else {
    document.getElementById('input-task-name').value  = '';
    document.getElementById('input-task-genre').value = 'living';
    document.getElementById('input-task-memo').value  = '';
    setRadio('input-task-cycle', 'weekly');
    setRadio('input-task-diff',  'easy');
    document.getElementById('input-custom-days').value = 3;
    document.getElementById('custom-days-row').style.display = 'none';
    const hintEl = document.getElementById('genre-auto-hint');
    if (hintEl) hintEl.style.display = 'none';
  }
  document.getElementById('modal-task').classList.remove('hidden');
}

function closeTaskModal() { document.getElementById('modal-task').classList.add('hidden'); }

function saveTask() {
  const name = document.getElementById('input-task-name').value.trim();
  if (!name) { showToast('タスク名を入力してください'); return; }
  const cycle = getRadio('input-task-cycle') || 'weekly';
  const customDays = cycle === 'custom'
    ? Math.max(1, Number(document.getElementById('input-custom-days').value) || 1)
    : undefined;
  if (cycle === 'custom' && (!customDays || customDays < 1)) {
    showToast('日数を1以上で入力してください'); return;
  }
  const payload = {
    name,
    genre: document.getElementById('input-task-genre').value,
    cycle,
    ...(cycle === 'custom' ? { customDays } : {}),
    diff:  getRadio('input-task-diff') || 'easy',
    memo:  document.getElementById('input-task-memo').value.trim(),
  };
  const tasks = DB.get(DB.K.tasks);
  if (editingTaskId) {
    const i = tasks.findIndex(t => t.id === editingTaskId);
    if (i !== -1) Object.assign(tasks[i], payload);
  } else {
    tasks.push({ id: uid(), ...payload, lastDone: null, createdAt: new Date().toISOString() });
  }
  DB.set(DB.K.tasks, tasks);
  closeTaskModal();
  renderCalendar(); renderTaskList();
  showToast(editingTaskId ? '更新しました' : '追加しました');
}

function deleteTask() {
  if (!confirm('このタスクを削除しますか？')) return;
  DB.set(DB.K.tasks, DB.get(DB.K.tasks).filter(t => t.id !== editingTaskId));
  closeTaskModal();
  renderCalendar(); renderTaskList();
  showToast('削除しました');
}

// 完了記録モーダル
let recordDate = null;
let recordSelected = new Set(); // taskId set

function openRecordModal(date) {
  recordDate = date;
  recordSelected = new Set();
  document.getElementById('modal-record-title').textContent = '完了を記録';
  document.getElementById('modal-record-date-label').textContent = D.jpFull(date) + ' に完了したタスク';

  const tasks = DB.get(DB.K.tasks);
  const dueTasks = tasks.filter(t => isDueOn(t, date));

  const listEl = document.getElementById('modal-record-task-list');
  if (!dueTasks.length) {
    listEl.innerHTML = `<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px 0;">この日に期限のタスクはありません</div>`;
  } else {
    listEl.innerHTML = dueTasks.map(t => {
      const g    = getGenre(t.genre);
      const done = isDoneOn(t.id, date);
      return `
      <label style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1.5px solid var(--border);cursor:pointer;background:${done ? 'var(--g50)' : 'var(--white)'};">
        <input type="checkbox" data-rid="${t.id}" ${done ? 'checked' : ''} style="width:18px;height:18px;accent-color:var(--g500);">
        <div class="task-item-icon" style="background:${g.bg};width:32px;height:32px;border-radius:8px;flex-shrink:0;display:flex;align-items:center;justify-content:center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="${g.color}" stroke-width="1.8" width="18" height="18">${g.icon.replace(/<svg[^>]*>/,'').replace('</svg>','')}</svg>
        </div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:700;">${t.name}</div>
          <div style="font-size:11px;color:var(--muted);">${g.label}・${getCycleLabel(t)}</div>
        </div>
      </label>`;
    }).join('');
  }
  document.getElementById('modal-record').classList.remove('hidden');
}

function closeRecordModal() { document.getElementById('modal-record').classList.add('hidden'); }

function saveRecord() {
  if (!recordDate) return;
  const checkboxes = document.querySelectorAll('#modal-record-task-list input[type=checkbox]');
  checkboxes.forEach(cb => {
    const tid = cb.dataset.rid;
    const already = isDoneOn(tid, recordDate);
    if (cb.checked && !already) completeTask(tid, recordDate);
    if (!cb.checked && already) undoComplete(tid, recordDate);
  });
  closeRecordModal();
  renderCalendar();
  showToast('記録を保存しました');
  checkAndShowUnlock();
  checkAndShowNewTitle();
  document.dispatchEvent(new Event('taskCompleted'));
}

// 生理モーダル（日付単位）
let periodModalDate = null;

function openPeriodModal(date) {
  periodModalDate = date || D.today();
  // 日付入力に設定
  document.getElementById('input-period-date').value = periodModalDate;
  // 既存記録があれば読み込む
  const existing = getPeriodDay(periodModalDate);
  document.getElementById('input-period-memo').value = existing?.memo || '';
  setRadio('input-period-flow', existing?.flow || 'normal');
  document.querySelectorAll('#input-period-symptoms .radio-btn').forEach(b => {
    b.classList.toggle('active', existing?.symptoms?.includes(b.dataset.val) || false);
  });
  document.getElementById('modal-period').classList.remove('hidden');
}
function closePeriodModal() { document.getElementById('modal-period').classList.add('hidden'); }

function savePeriod() {
  // 日付入力から取得（変更されていれば新しい日付を使う）
  const dateInput = document.getElementById('input-period-date').value;
  if (!dateInput) { showToast('日付を入力してください'); return; }
  periodModalDate = dateInput;
  const flow = getRadio('input-period-flow');
  const symptoms = [...document.querySelectorAll('#input-period-symptoms .radio-btn.active')].map(b => b.dataset.val);
  const memo = document.getElementById('input-period-memo').value.trim();
  setPeriodDay(periodModalDate, flow, symptoms, memo);
  closePeriodModal();
  renderPeriod(); renderCalendar();
  showToast('記録しました');
  // パートナーに通知
  onPeriodUpdated();
}

// ブラウザ通知（Notification API）
function showBrowserNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: './kakusann.png' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(p => {
      if (p === 'granted') new Notification(title, { body, icon: './kakusann.png' });
    });
  }
}

// 通知許可をリクエスト（共有接続時に呼ぶ）
function requestNotificationPermission() {
  if (!('Notification' in window) || Notification.permission === 'granted') return;
  Notification.requestPermission();
}

// パートナー共有モーダル
function openShareModal() {
  renderShareModalState();
  document.getElementById('modal-share').classList.remove('hidden');
}
function closeShareModal() { document.getElementById('modal-share').classList.add('hidden'); }

// 共有モーダルの状態に応じてUIを切り替える
function renderShareModalState() {
  const modal = document.getElementById('modal-share');
  if (!modal) return;

  const connected = isPartnerConnected();
  const hasRoom   = !!_shareRoom;

  // 各パネル
  const panelInvite    = document.getElementById('share-panel-invite');
  const panelConnected = document.getElementById('share-panel-connected');

  if (connected) {
    panelInvite.style.display    = 'none';
    panelConnected.style.display = '';
    renderShareComments();
  } else if (hasRoom) {
    // ルームあり・未接続（招待待ち）
    panelInvite.style.display    = '';
    panelConnected.style.display = 'none';
    document.getElementById('share-invite-waiting').style.display = '';
    document.getElementById('share-invite-form').style.display    = 'none';
    // 招待URLを再表示
    const urlEl = document.getElementById('share-invite-url-text');
    if (urlEl) urlEl.textContent = buildInviteURL(_shareRoom.id);
  } else {
    panelInvite.style.display    = '';
    panelConnected.style.display = 'none';
    document.getElementById('share-invite-waiting').style.display = 'none';
    document.getElementById('share-invite-form').style.display    = '';
  }
}

// コメント欄を再描画
function renderShareComments() {
  const el = document.getElementById('share-comments-list');
  if (!el) return;
  const myUid = getUserId();
  if (!_roomComments.length) {
    el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:16px 0;">まだコメントはありません</div>';
    return;
  }
  el.innerHTML = _roomComments.map(c => {
    const isMine = c.uid === myUid;
    const timeStr = c.createdAt?.toDate
      ? c.createdAt.toDate().toLocaleString('ja-JP', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })
      : '';
    return `<div class="share-comment ${isMine ? 'share-comment-mine' : 'share-comment-theirs'}">
      <div class="share-comment-text">${_escapeHtml(c.text)}</div>
      <div class="share-comment-time">${timeStr}</div>
    </div>`;
  }).join('');
  el.scrollTop = el.scrollHeight;
}

function _escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ----------------------------------------------------------------
// 11. Radio helper
// ----------------------------------------------------------------
function setRadio(gid, val) {
  document.querySelectorAll(`#${gid} .radio-btn`).forEach(b => b.classList.toggle('active', b.dataset.val === val));
}
function getRadio(gid) {
  return document.querySelector(`#${gid} .radio-btn.active`)?.dataset.val || null;
}

// ----------------------------------------------------------------
// 12. ナビゲーション
// ----------------------------------------------------------------
let currentScreen = 'calendar';
function switchScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
  document.querySelector(`.nav-item[data-screen="${name}"]`).classList.add('active');
  currentScreen = name;
  // FABはタスク画面のみ表示（renderTaskList内でも制御するが確実にするため）
  const fab = document.getElementById('btn-add-task');
  if (fab) fab.style.display = (name === 'tasks') ? '' : 'none';
  if (name === 'calendar') renderCalendar();
  if (name === 'tasks')    renderTaskList();
  if (name === 'period')   renderPeriod();
  if (name === 'settings') renderSettings();
  document.dispatchEvent(new CustomEvent('screenChanged', { detail: name }));
}

// ----------------------------------------------------------------
// 13. Toast
// ----------------------------------------------------------------
let toastTimer;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ----------------------------------------------------------------
// 14. イベント登録
// ----------------------------------------------------------------
function bindEvents() {
  // nav
  document.querySelectorAll('.nav-item').forEach(b =>
    b.addEventListener('click', () => switchScreen(b.dataset.screen))
  );

  // 称号UPモーダルを閉じる
  document.getElementById('btn-title-up-close').addEventListener('click', () => {
    document.getElementById('modal-title-up').classList.add('hidden');
  });
  document.getElementById('modal-title-up').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-title-up'))
      document.getElementById('modal-title-up').classList.add('hidden');
  });

  // calendar month nav
  document.getElementById('cal-prev').addEventListener('click', () => {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });

  // calendar day click（生理画面中はタップで生理記録モーダルを開く）
  document.getElementById('cal-days').addEventListener('click', e => {
    const day = e.target.closest('.cal-day');
    if (!day) return;
    calSelectedDate = day.dataset.date;
    if (currentScreen === 'period') {
      openPeriodModal(calSelectedDate);
    } else {
      renderCalendar();
    }
  });

  // genre tabs (calendar)
  document.getElementById('genre-tabs').addEventListener('click', e => {
    const tab = e.target.closest('[data-genre]');
    if (!tab) return;
    calGenreFilter = tab.dataset.genre;
    renderCalendar();
  });

  // day task card click (toggle done) — 通常のdayパネル
  document.getElementById('day-task-list').addEventListener('click', e => {
    const card = e.target.closest('.day-task-card');
    if (!card) return;
    const tid  = card.dataset.taskId;
    const date = card.dataset.date;
    if (isDoneOn(tid, date)) { undoComplete(tid, date); showToast('取り消しました'); }
    else                     { completeTask(tid, date); showToast('完了！'); checkAndShowUnlock(); checkAndShowNewTitle(); document.dispatchEvent(new Event('taskCompleted')); }
    renderCalendar();
  });

  // タスクなし提案バナーのボタン
  const goAddTaskBtn = document.getElementById('btn-go-add-task-banner');
  if (goAddTaskBtn) goAddTaskBtn.addEventListener('click', () => {
    document.querySelector('.nav-item[data-screen="tasks"]')?.click();
    setTimeout(() => document.getElementById('btn-add-task')?.click(), 150);
  });

  // ウェルカムパネルのファーストタスクをクリック（トグル）
  document.getElementById('cal-welcome-panel').addEventListener('click', e => {
    const card = e.target.closest('.welcome-first-task');
    if (!card) return;
    const tid  = card.dataset.taskId;
    const date = card.dataset.date;
    if (isDoneOn(tid, date)) {
      undoComplete(tid, date);
      showToast('取り消しました');
    } else {
      completeTask(tid, date);
      checkAndShowNewTitle();
      document.dispatchEvent(new Event('taskCompleted'));
      showToast('やった！ファーストタスク完了！🎉');
      // 完了後にタスク画面が解放されることを通知
      setTimeout(() => {
        showToast('タスク追加とAI提案が使えるようになりました！');
        renderCalendar();
        renderTaskList();
      }, 1800);
    }
    renderCalendar();
  });

  // record modal
  document.getElementById('modal-record-close').addEventListener('click', closeRecordModal);
  document.getElementById('btn-save-record').addEventListener('click', saveRecord);
  document.getElementById('modal-record').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-record')) closeRecordModal();
  });

  // task list genre
  document.getElementById('task-genre-bar').addEventListener('click', e => {
    const tab = e.target.closest('[data-tgenre]');
    if (!tab) return;
    taskGenreFilter = tab.dataset.tgenre;
    renderTaskList();
  });

  // task list: edit button + AI提案ボタン
  document.getElementById('task-list-body').addEventListener('click', e => {
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) { openTaskModal(editBtn.dataset.edit); return; }

    // AI提案：「追加」ボタン
    const addBtn = e.target.closest('.suggest-add-btn');
    if (addBtn) {
      const { sname, sgenre, scycle, sdiff } = addBtn.dataset;
      const tasks = DB.get(DB.K.tasks);
      if (!tasks.find(t => t.name === sname)) {
        tasks.push({ id: uid(), name: sname, genre: sgenre, cycle: scycle, diff: sdiff,
          memo: '', lastDone: null, createdAt: new Date().toISOString() });
        DB.set(DB.K.tasks, tasks);
        renderCalendar();
        renderTaskList();
        showToast(`「${sname}」を追加しました`);
      }
      return;
    }

    // AI提案：「×」却下ボタン（却下回数を記録し優先度ペナルティを与える）
    const dismissBtn = e.target.closest('.suggest-dismiss-btn');
    if (dismissBtn) {
      const name = dismissBtn.dataset.sname;
      const dismissed = DB.get(DB.K.dismissed_suggest);
      const idx = dismissed.findIndex(d => d.name === name);
      if (idx >= 0) {
        dismissed[idx].count = (dismissed[idx].count || 1) + 1;
      } else {
        dismissed.push({ name, count: 1 });
      }
      DB.set(DB.K.dismissed_suggest, dismissed);
      renderTaskList();
      return;
    }
  });

  // add task
  document.getElementById('btn-add-task').addEventListener('click', () => openTaskModal());

  // カレンダー：日パネル「完了を記録」ボタン
  document.getElementById('btn-day-record')?.addEventListener('click', () => {
    openRecordModal(calSelectedDate);
  });

  // task modal
  document.getElementById('modal-task-close').addEventListener('click', closeTaskModal);
  document.getElementById('btn-save-task').addEventListener('click', saveTask);
  document.getElementById('btn-delete-task').addEventListener('click', deleteTask);
  document.getElementById('modal-task').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-task')) closeTaskModal();
  });
  ['input-task-cycle','input-task-diff'].forEach(gid => {
    document.getElementById(gid).addEventListener('click', e => {
      const b = e.target.closest('.radio-btn'); if (!b) return;
      setRadio(gid, b.dataset.val);
      if (gid === 'input-task-cycle') {
        document.getElementById('custom-days-row').style.display =
          b.dataset.val === 'custom' ? 'flex' : 'none';
      }
    });
  });

  // タスク名入力でジャンルを自動推定
  document.getElementById('input-task-name').addEventListener('input', e => {
    if (editingTaskId) return; // 編集時は変更しない
    const name = e.target.value.trim();
    const guessed = guessGenre(name);
    const genreEl = document.getElementById('input-task-genre');
    const hintEl  = document.getElementById('genre-auto-hint');
    if (guessed && genreEl) {
      genreEl.value = guessed;
      if (hintEl) {
        const g = getGenre(guessed);
        hintEl.textContent = `→ ${g.label} に自動設定`;
        hintEl.style.display = '';
      }
    } else if (hintEl) {
      hintEl.style.display = 'none';
    }
  });

  // 生理ミニカレンダー ナビゲーション
  document.getElementById('period-cal-prev').addEventListener('click', () => {
    periodCalMonth--;
    if (periodCalMonth < 0) { periodCalMonth = 11; periodCalYear--; }
    renderPeriodCal();
  });
  document.getElementById('period-cal-next').addEventListener('click', () => {
    periodCalMonth++;
    if (periodCalMonth > 11) { periodCalMonth = 0; periodCalYear++; }
    renderPeriodCal();
  });
  document.getElementById('period-cal-today').addEventListener('click', () => {
    const now = new Date();
    periodCalYear  = now.getFullYear();
    periodCalMonth = now.getMonth();
    renderPeriodCal();
  });
  // 生理ミニカレンダー 日付クリック → モーダルを開く
  document.getElementById('period-cal-days').addEventListener('click', e => {
    const day = e.target.closest('[data-pdate]');
    if (!day || day.classList.contains('other-month')) return;
    openPeriodModal(day.dataset.pdate);
  });

  // period
  document.getElementById('btn-add-period').addEventListener('click', () => openPeriodModal(D.today()));
  document.getElementById('modal-period-close').addEventListener('click', closePeriodModal);
  document.getElementById('btn-save-period').addEventListener('click', savePeriod);
  document.getElementById('modal-period').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-period')) closePeriodModal();
  });
  // 日付を変更したら既存記録をその日付分に切り替える
  document.getElementById('input-period-date').addEventListener('change', e => {
    const d = e.target.value;
    if (!d) return;
    periodModalDate = d;
    const existing = getPeriodDay(d);
    document.getElementById('input-period-memo').value = existing?.memo || '';
    setRadio('input-period-flow', existing?.flow || 'normal');
    document.querySelectorAll('#input-period-symptoms .radio-btn').forEach(b => {
      b.classList.toggle('active', existing?.symptoms?.includes(b.dataset.val) || false);
    });
  });
  document.getElementById('input-period-flow').addEventListener('click', e => {
    const b = e.target.closest('.radio-btn'); if (b) setRadio('input-period-flow', b.dataset.val);
  });
  document.getElementById('input-period-symptoms').addEventListener('click', e => {
    const b = e.target.closest('.radio-btn'); if (b) b.classList.toggle('active');
  });
  // 記録削除（data-del-date属性に変更）
  document.getElementById('period-log-list').addEventListener('click', e => {
    // 削除ボタン
    const del = e.target.closest('[data-del-date]');
    if (del) {
      if (!confirm('この日の記録を削除しますか？')) return;
      setPeriodDay(del.dataset.delDate, 'none');
      renderPeriod(); renderCalendar();
      showToast('削除しました');
      return;
    }
    // 行タップ → 編集
    const row = e.target.closest('[data-log-date]');
    if (row) openPeriodModal(row.dataset.logDate);
  });

  // パートナー共有モーダル開閉
  document.getElementById('btn-open-share').addEventListener('click', openShareModal);
  document.getElementById('modal-share-close').addEventListener('click', closeShareModal);
  document.getElementById('modal-share').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-share')) closeShareModal();
  });

  // 招待リンクを作成
  let _inviteURL = '';
  document.getElementById('btn-gen-invite').addEventListener('click', async () => {
    if (!isLoggedIn()) { showToast('Googleログインが必要です'); openAuthModal('login'); return; }
    const btn = document.getElementById('btn-gen-invite');
    btn.disabled = true;
    btn.textContent = '作成中…';
    const result = await createInviteLink();
    btn.disabled = false;
    btn.textContent = '招待リンクを作成';
    if (result.error) { showToast(result.error); return; }
    _inviteURL = result.url;
    document.getElementById('share-invite-url-text').textContent = _inviteURL;
    document.getElementById('share-invite-waiting').style.display = '';
    document.getElementById('share-invite-form').style.display    = 'none';
    requestNotificationPermission();
  });

  // LINEで送る
  document.getElementById('btn-invite-line').addEventListener('click', () => {
    if (!_inviteURL) return;
    const text = 'おうちリズムで生理記録を共有します。下のURLから参加してね！\n' + _inviteURL;
    window.open('https://line.me/R/msg/text/?' + encodeURIComponent(text), '_blank');
  });

  // URLコピー
  document.getElementById('btn-invite-copy').addEventListener('click', () => {
    if (!_inviteURL) {
      // 招待待ちパネルからも呼ばれる場合
      _inviteURL = document.getElementById('share-invite-url-text')?.textContent || '';
    }
    if (!_inviteURL) return;
    navigator.clipboard?.writeText(_inviteURL)
      .then(() => showToast('URLをコピーしました'))
      .catch(() => showToast('コピーに失敗しました'));
  });

  // ルームを解除
  document.getElementById('btn-leave-room').addEventListener('click', async () => {
    if (!confirm('パートナーとの共有を解除しますか？')) return;
    const roomId = getShareRoomId();
    if (roomId) await leaveShareRoom(roomId);
    _shareRoom = null;
    _partnerPeriodDays = [];
    _roomComments = [];
    DB.set(DB.K.partner, null);
    closeShareModal();
    renderPeriod();
    showToast('共有を解除しました');
  });

  // コメント投稿
  document.getElementById('btn-post-comment').addEventListener('click', async () => {
    const input = document.getElementById('share-comment-input-new');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await postComment(getShareRoomId(), text);
    // リスナーが自動更新するので renderShareComments は不要
  });
  // Enterキーでも投稿
  document.getElementById('share-comment-input-new').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('btn-post-comment').click();
    }
  });

  // タスク設定促進バナーのボタン → タスク追加モーダルを開く
  document.getElementById('btn-setup-task')?.addEventListener('click', () => {
    openTaskModal();
  });
  // バナー内の「完了を記録」ボタン → 記録モーダルを開く
  document.getElementById('btn-setup-record-done')?.addEventListener('click', () => {
    openRecordModal(calSelectedDate);
  });

  // カレンダー検索
  const searchInput = document.getElementById('cal-search-input');
  const searchClear = document.getElementById('cal-search-clear');
  const searchResults = document.getElementById('cal-search-results');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    searchClear.style.display = q ? '' : 'none';
    if (!q) {
      searchResults.style.display = 'none';
      return;
    }
    renderCalSearchResults(q);
    searchResults.style.display = '';
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    searchResults.style.display = 'none';
    searchInput.focus();
  });

  // 検索結果の行タップ → その日に移動してパネルを開く
  searchResults.addEventListener('click', e => {
    const row = e.target.closest('[data-search-date]');
    if (!row) return;
    const date = row.dataset.searchDate;
    searchInput.value = '';
    searchClear.style.display = 'none';
    searchResults.style.display = 'none';
    // 対象月に移動
    const d = new Date(date + 'T00:00:00');
    calYear  = d.getFullYear();
    calMonth = d.getMonth();
    calSelectedDate = date;
    renderCalendar();
    renderDayPanel(date);
  });

  // settings
  ['setting-home-type','setting-clean-level','setting-cycle','setting-period-len'].forEach(id =>
    document.getElementById(id).addEventListener('change', saveSettings)
  );

  // export
  document.getElementById('btn-export').addEventListener('click', () => {
    const data = {
      tasks:   DB.get(DB.K.tasks),
      logs:    DB.get(DB.K.logs),
      periods: DB.get(DB.K.periods),
      settings: DB.getObj(DB.K.settings, DEFAULT_SETTINGS),
      exportedAt: new Date().toISOString(),
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
    a.download = `ouchi-rhythm-${D.today()}.json`;
    a.click();
    showToast('エクスポートしました');
  });

  // reset
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('全データを削除します。元に戻せません。')) return;
    Object.values(DB.K).forEach(k => localStorage.removeItem(k));
    initData();
    switchScreen('calendar');
    showToast('リセットしました');
  });
}

// ----------------------------------------------------------------
// 15. PC / スマホ レイアウト切り替え
// ----------------------------------------------------------------
const PC_BREAKPOINT = 768;

function isPC() { return window.innerWidth >= PC_BREAKPOINT; }

function applyLayout() {
  // CSS の @media で大半を制御。
  // JS では PC 時だけ btn-add-task-pc / btn-add-period-pc を visible にする。
  const pc = isPC();
  const pcTaskBtn   = document.getElementById('btn-add-task-pc');
  const pcPeriodBtn = document.getElementById('btn-add-period-pc');
  if (pcTaskBtn)   pcTaskBtn.style.display   = pc ? 'flex' : 'none';
  if (pcPeriodBtn) pcPeriodBtn.style.display = pc ? 'inline-flex' : 'none';
}

function syncTasksSub() {
  const val = document.getElementById('tasks-sub').textContent;
  const pcSub = document.getElementById('tasks-sub-pc');
  if (pcSub) pcSub.textContent = val;
}

// ----------------------------------------------------------------
// 16. スプラッシュ（今日のおむかえ）
// ----------------------------------------------------------------

// 引用はちいかわ作品（漫画・アニメ）でキャラクターが実際に使う口調・言い回しを
// 元にしたセリフです（原作の雰囲気を尊重した再現）。
const SPLASH_QUOTES = [
  // ちいかわが「えらい」と言われ／言う場面は作中で頻出するフレーズ
  { text: 'えらい…！えらいよ…！！', author: 'ちいかわ' },
  // 作中でちいかわが試練を乗り越えたときの典型的な一言
  { text: 'やった…！できた…！！', author: 'ちいかわ' },
  // ハチワレが励ますときの定番フレーズ
  { text: 'がんばれ！がんばれ！！', author: 'ハチワレ' },
  // 作中でハチワレがちいかわを応援する際の口調
  { text: 'きみならできる！ぜったいできる！', author: 'ハチワレ' },
  // うさぎが全力で喜ぶ場面の典型的なセリフ
  { text: 'やったーーー！！！', author: 'うさぎ' },
  // うさぎが気合を入れるときの一言（アニメでも使われる）
  { text: 'ファイトだよ！！', author: 'うさぎ' },
  // ちいかわが「もしかしてえらい？」と思う自己肯定シーン
  { text: 'もしかして…えらい…？', author: 'ちいかわ' },
  // ハチワレが前向きな言葉をかける場面のフレーズ
  { text: 'すこしずつでいい。すこしずつえらくなれる！', author: 'ハチワレ' },
  // ちいかわが疲れながらも達成した後のつぶやき
  { text: 'つかれた…でも、できた…！', author: 'ちいかわ' },
  // うさぎが仲間を称える場面の口調
  { text: 'えらいえらい！えらすぎ！！', author: 'うさぎ' },
  // ハチワレの励ましの言葉（作中の雰囲気に沿ったもの）
  { text: 'あきらめなかったね。すごいよ。', author: 'ハチワレ' },
  // ちいかわが小さなことでも喜ぶシーン
  { text: 'ちいさなことでも…うれしい…！', author: 'ちいかわ' },
];

function buildSplashActivity() {
  const today   = D.today();
  const logs    = DB.get(DB.K.logs);
  const tasks   = DB.get(DB.K.tasks);
  const periods = DB.get(DB.K.period_days);

  // 今日完了したタスク数
  const doneToday = logs.filter(l => l.completedAt === today).length;

  // 今週（過去7日）の完了数
  const weekAgo = D.addDays(today, -6);
  const doneWeek = logs.filter(l => l.completedAt >= weekAgo && l.completedAt <= today).length;

  // 連続記録日数（掃除ログ）
  let streak = 0;
  {
    let d = today;
    while (logs.some(l => l.completedAt === d)) {
      streak++;
      d = D.addDays(d, -1);
    }
  }

  // 期限切れタスク数
  const overdue = tasks.filter(t => daysUntilDue(t) < 0).length;

  // 生理記録の件数
  const periodCount = periods.length;

  // アクティビティに応じたコメントを組み立て
  const lines = [];

  if (doneToday > 0) {
    lines.push(`今日すでに ${doneToday} 件こなしてるよ！えらい！`);
  } else if (overdue > 0) {
    lines.push(`ちょっとだけ遅れてるのが ${overdue} 件あるよ。すこしずつで大丈夫！`);
  } else {
    lines.push('きょうもいっしょにおうちリズムを整えよう！');
  }

  if (streak >= 3) {
    lines.push(`${streak} 日つづけてるよ！すごい！習慣になってきたね！`);
  } else if (doneWeek >= 5) {
    lines.push(`今週は ${doneWeek} 件もこなしてる！この調子！`);
  }

  if (periodCount >= 3) {
    lines.push('生理の記録もちゃんとつづいてる。じぶんを大切にしてて、えらい！');
  }

  return lines.join('<br>');
}

// 時間帯別SVGアイコンHTML（絵文字不使用）
const SPLASH_ICONS = {
  // 深夜（0〜4時）：月と星
  night: `<svg viewBox="0 0 96 96" width="100" height="100" fill="none">
    <circle cx="48" cy="48" r="44" fill="#e8eaf6"/>
    <path d="M58 22a28 28 0 01-28 44 28 28 0 1028-44z" fill="#7986cb"/>
    <circle cx="40" cy="30" r="3" fill="#fff" opacity=".75"/>
    <circle cx="68" cy="38" r="2" fill="#fff" opacity=".55"/>
    <circle cx="64" cy="20" r="2" fill="#fff" opacity=".65"/>
    <circle cx="30" cy="55" r="1.5" fill="#fff" opacity=".4"/>
    <circle cx="72" cy="58" r="1.5" fill="#fff" opacity=".45"/>
  </svg>`,
  // 朝（5〜9時）：太陽と光線
  morning: `<svg viewBox="0 0 96 96" width="100" height="100" fill="none">
    <circle cx="48" cy="48" r="44" fill="#fffde7"/>
    <circle cx="48" cy="48" r="20" fill="#fdd835"/>
    <circle cx="48" cy="48" r="16" fill="#ffee58"/>
    <g stroke="#fdd835" stroke-width="4" stroke-linecap="round">
      <line x1="48" y1="10" x2="48" y2="20"/>
      <line x1="48" y1="76" x2="48" y2="86"/>
      <line x1="10" y1="48" x2="20" y2="48"/>
      <line x1="76" y1="48" x2="86" y2="48"/>
      <line x1="21" y1="21" x2="28" y2="28"/>
      <line x1="68" y1="68" x2="75" y2="75"/>
      <line x1="75" y1="21" x2="68" y2="28"/>
      <line x1="28" y1="68" x2="21" y2="75"/>
    </g>
  </svg>`,
  // 昼（10〜16時）：青空と雲
  day: `<svg viewBox="0 0 96 96" width="100" height="100" fill="none">
    <circle cx="48" cy="48" r="44" fill="#e3f2fd"/>
    <circle cx="48" cy="38" r="14" fill="#ffee58"/>
    <ellipse cx="36" cy="58" rx="16" ry="10" fill="#fff"/>
    <ellipse cx="54" cy="62" rx="20" ry="12" fill="#fff"/>
    <ellipse cx="70" cy="60" rx="13" ry="9" fill="#fff"/>
    <ellipse cx="36" cy="58" rx="12" ry="8" fill="#f5f5f5"/>
    <ellipse cx="54" cy="62" rx="16" ry="10" fill="#fafafa"/>
  </svg>`,
  // 夕方（17〜23時）：夕焼け空
  evening: `<svg viewBox="0 0 96 96" width="100" height="100" fill="none">
    <circle cx="48" cy="48" r="44" fill="#fff3e0"/>
    <circle cx="48" cy="42" r="18" fill="#ffb74d"/>
    <circle cx="48" cy="42" r="14" fill="#ffa726"/>
    <path d="M8 62 Q24 50 48 56 Q72 62 88 50" stroke="#ff8f00" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M8 70 Q24 58 48 64 Q72 70 88 58" stroke="#ffa726" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".7"/>
    <path d="M8 78 Q24 66 48 72 Q72 78 88 66" stroke="#ffcc02" stroke-width="2" fill="none" stroke-linecap="round" opacity=".45"/>
  </svg>`,
};

function buildSplashGreeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'おやすみ前に…';
  if (h < 10) return 'おはよう！';
  if (h < 17) return 'こんにちは！';
  return 'おかえり！';
}

function buildSplashIcon() {
  const h = new Date().getHours();
  if (h < 5)  return SPLASH_ICONS.night;
  if (h < 10) return SPLASH_ICONS.morning;
  if (h < 17) return SPLASH_ICONS.day;
  return SPLASH_ICONS.evening;
}

function spawnParticles() {
  const container = document.getElementById('splash-particles');
  if (!container) return;
  const colors = ['#72c99b','#a8dfc0','#d4f0e2','#fdeaea','#ede9f8','#fef3d8'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'splash-particle';
    const size = 6 + Math.random() * 10;
    p.style.cssText = [
      `width:${size}px`, `height:${size}px`,
      `left:${Math.random() * 100}%`,
      `bottom:${Math.random() * 30}%`,
      `background:${colors[Math.floor(Math.random() * colors.length)]}`,
      `animation-delay:${Math.random() * 1.2}s`,
      `animation-duration:${1.8 + Math.random() * 1.4}s`,
    ].join(';');
    container.appendChild(p);
  }
}

function showSplash() {
  const key     = 'splash_last_shown';
  const today   = D.today();
  const last    = localStorage.getItem(key);
  // if (last === today) return; // テスト中：毎回表示

  // コンテンツを組み立て
  document.getElementById('splash-greeting').textContent  = buildSplashGreeting();
  document.getElementById('splash-icon').innerHTML        = buildSplashIcon();
  document.getElementById('splash-activity').innerHTML    = buildSplashActivity();

  spawnParticles();
  document.getElementById('splash-overlay').classList.remove('hidden');

  document.getElementById('splash-close').onclick = () => {
    document.getElementById('splash-overlay').classList.add('hidden');
  };
  document.getElementById('splash-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('splash-overlay'))
      document.getElementById('splash-overlay').classList.add('hidden');
  });

  localStorage.setItem(key, today);
}

// ----------------------------------------------------------------
// 17. タスクアンロック（ゲーム要素）
// ----------------------------------------------------------------

// 完了数に応じて段階的にアンロックされる追加タスク候補
// requiredLogs: 累計完了ログ数がこの数を超えたらアンロック通知
const UNLOCK_TASKS = [
  { id:'ul_01', requiredLogs:  5, name:'枕カバーを替える',        genre:'bedroom', cycle:'weekly',  diff:'easy', desc:'週1回替えると睡眠の質がアップ。肌荒れ防止にも！' },
  { id:'ul_02', requiredLogs: 10, name:'ドアノブ・スイッチを拭く', genre:'living',  cycle:'weekly',  diff:'easy', desc:'手が触れる場所は意外と汚れがち。サッと一拭きで清潔に！' },
  { id:'ul_03', requiredLogs: 15, name:'洗濯槽を洗う',            genre:'wash',    cycle:'monthly', diff:'mid',  desc:'洗濯機の内側も月1でケアしよう。衣類の清潔さが変わるよ！' },
  { id:'ul_04', requiredLogs: 20, name:'電子レンジの外を拭く',    genre:'kitchen', cycle:'weekly',  diff:'easy', desc:'油汚れが固まる前に！毎週さっと拭くと楽になるよ。' },
  { id:'ul_05', requiredLogs: 25, name:'玄関タイルを磨く',        genre:'entrance',cycle:'monthly', diff:'easy', desc:'靴の泥汚れが蓄積しがち。月1で磨くと印象がぐっと変わる！' },
  { id:'ul_06', requiredLogs: 35, name:'冷蔵庫の中を整理する',    genre:'kitchen', cycle:'monthly', diff:'mid',  desc:'食品ロス防止にも！月1で中身を確認＆拭き掃除しよう。' },
  { id:'ul_07', requiredLogs: 45, name:'ベランダを掃く',          genre:'window',  cycle:'monthly', diff:'easy', desc:'花粉・ほこりが溜まりやすい。月1でサッとひと掃き！' },
  { id:'ul_08', requiredLogs: 60, name:'浴室の換気扇を掃除する',  genre:'bath',    cycle:'season',  diff:'mid',  desc:'放置すると効率ダウン。3ヶ月に1回でカビ対策にもなるよ！' },
  { id:'ul_09', requiredLogs: 80, name:'照明器具のホコリを取る',  genre:'living',  cycle:'season',  diff:'easy', desc:'照明が明るくなる！3ヶ月に1回ハタキでサッと取るだけ。' },
  { id:'ul_10', requiredLogs:100, name:'押し入れ・クローゼット整理',genre:'bedroom',cycle:'season', diff:'hard',  desc:'年に4回が目安。モノの居場所を決めると暮らしが楽になるよ！' },
];

// 次にアンロックすべきタスクを1件返す
function getNextUnlock() {
  const logCount  = DB.get(DB.K.logs).length;
  const unlockedIds = DB.get(DB.K.unlocked); // 通知済みIDの配列
  const existing  = DB.get(DB.K.tasks).map(t => t.name);
  return UNLOCK_TASKS.find(u =>
    logCount >= u.requiredLogs &&
    !unlockedIds.includes(u.id) &&
    !existing.includes(u.name)   // 既にあるタスク名は出さない
  ) || null;
}

let _pendingUnlock = null;

function checkAndShowUnlock() {
  const next = getNextUnlock();
  if (!next) return;
  _pendingUnlock = next;
  document.getElementById('unlock-task-name').textContent = next.name;
  document.getElementById('unlock-task-desc').textContent = next.desc;
  document.getElementById('modal-unlock').classList.remove('hidden');
}

function bindUnlockEvents() {
  document.getElementById('btn-unlock-add').addEventListener('click', () => {
    if (!_pendingUnlock) return;
    // タスクに追加
    const tasks = DB.get(DB.K.tasks);
    tasks.push({
      id: uid(), name: _pendingUnlock.name, genre: _pendingUnlock.genre,
      cycle: _pendingUnlock.cycle, diff: _pendingUnlock.diff,
      memo: _pendingUnlock.desc, lastDone: null, createdAt: new Date().toISOString(),
    });
    DB.set(DB.K.tasks, tasks);
    // 通知済みに記録
    const done = DB.get(DB.K.unlocked);
    done.push(_pendingUnlock.id);
    DB.set(DB.K.unlocked, done);
    _pendingUnlock = null;
    document.getElementById('modal-unlock').classList.add('hidden');
    renderCalendar(); renderTaskList();
    showToast('新しいタスクを追加しました！');
  });
  document.getElementById('btn-unlock-skip').addEventListener('click', () => {
    if (!_pendingUnlock) return;
    // スキップしても通知済み扱いにして次回は出さない
    const done = DB.get(DB.K.unlocked);
    done.push(_pendingUnlock.id);
    DB.set(DB.K.unlocked, done);
    _pendingUnlock = null;
    document.getElementById('modal-unlock').classList.add('hidden');
  });
}

// ----------------------------------------------------------------
// 18. PWA
// ----------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      // ローカル開発中はキャッシュを使わないよう SW を全解除
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister());
      });
    } else {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  });
}

// ----------------------------------------------------------------
// 19. 起動
// ----------------------------------------------------------------
initData();
bindEvents();
bindUnlockEvents();
bindAuthEvents();

// PC用ボタンのイベントをbindEventsの後に追加
document.getElementById('btn-add-task-pc').addEventListener('click', () => openTaskModal());
document.getElementById('btn-add-period-pc').addEventListener('click', () => openPeriodModal(D.today()));

// レイアウト適用 & リサイズ監視
applyLayout();
window.addEventListener('resize', applyLayout);

// 共有URL自動チェック（?share= があれば生理データを取り込む）
checkShareURLOnLoad();

switchScreen('calendar');

// Firebase / Cloud 初期化（initAuth 内で initializeApp → initFirestore の順に実行される）
initAuth();

// ログイン状態が確定してからスプラッシュ表示
onAuthReady(async user => {
  if (user) {
    await onUserSignedIn(user);
  } else if (FIREBASE_CONFIGURED) {
    // Firebase設定済みの本番環境でユーザーが未ログインの場合、
    // 匿名ログインして自動的にクラウドへデータを保存し始める
    try {
      const result = await firebase.auth().signInAnonymously();
      if (result.user) {
        await onUserSignedIn(result.user);
      }
    } catch (e) {
      console.warn('[Auth] 匿名ログイン失敗:', e);
    }
  }
  // 今日初回起動時のスプラッシュ
  showSplash();
});

// ----------------------------------------------------------------
// フローティングキャラクター（かくさん）
// ----------------------------------------------------------------
(function initCharaFloat() {
  const bubbleEl = document.getElementById('chara-bubble');
  const imgEl    = document.getElementById('chara-float-img');
  if (!bubbleEl || !imgEl) return;

  let bubbleTimer = null;

  // コンテキストに応じたセリフ一覧
  const CHARA_MESSAGES = {
    idle: [
      'おつかれさま！\nおうちきれいかな？',
      'こんにちは〜！\nいっしょにがんばろ！',
      'ちょっと休んでね〜',
      'タップしてみてね！',
      // かくさん自身の話
      'わたし、かくさんっていうの。\nよろしくね！',
      'かくさんはね、\nきれいなおうちが大好きなんだ',
      'じつはわたし、\nほこりが一番のてき…！',
      'おうちがきれいだと\nわたしも元気が出るよ！',
      'わたし、掃除してる人を\nみるのが一番すき〜！',
    ],
    overdue: [
      'ちょっとだけ\n遅れてるよ…大丈夫！',
      'すこしずつで\nOKだよ！',
      'できるときに\nやってみよう！',
      // かくさん自身の話
      'かくさんも\n苦手なことあるよ。\nいっしょに少しずつね！',
    ],
    doneToday: [
      'えらい！えらいよ〜！',
      '今日もできたね！\nすごい！',
      'きれいなおうち、\n気持ちいいね！',
      // かくさん自身の話
      'わたし、うれしくて\nくるくるしちゃうよ〜！',
      'かくさん感動した…！\nほんとにえらすぎ！',
    ],
    streak: [
      '連続記録中！\nすごすぎる！',
      'この調子だよ〜！',
      // かくさん自身の話
      'わたし、こんな人に\nそばにいてほしかったんだ！',
      'かくさん、もうファンになったよ！',
    ],
    morning: [
      'おはよう！\n今日もいいお天気だね',
      'きょうも\nいちにちがんばろ！',
      // かくさん自身の話
      'かくさんは朝が\n一番テンション上がるんだ！',
      'おはよう〜！\nかくさんも起きたてだよ',
    ],
    night: [
      'おつかれさま〜\nゆっくり休んでね',
      'きょうも\nえらかったよ！',
      // かくさん自身の話
      'かくさんも\nもうねむいよ〜…',
      'ゆっくり寝てね。\nかくさんがおうち見てるよ！',
    ],
  };

  function getMessages() {
    const h       = new Date().getHours();
    const today   = D.today();
    const logs    = DB.get(DB.K.logs);
    const tasks   = DB.get(DB.K.tasks);
    const doneToday = logs.filter(l => l.completedAt === today).length;
    const overdue   = tasks.filter(t => daysUntilDue(t) < 0).length;

    // 連続日数
    let streak = 0;
    let d = today;
    while (logs.some(l => l.completedAt === d)) { streak++; d = D.addDays(d, -1); }

    if (streak >= 3)    return CHARA_MESSAGES.streak;
    if (doneToday > 0)  return CHARA_MESSAGES.doneToday;
    if (overdue > 0)    return CHARA_MESSAGES.overdue;
    if (h < 10)         return CHARA_MESSAGES.morning;
    if (h >= 21)        return CHARA_MESSAGES.night;
    return CHARA_MESSAGES.idle;
  }

  function showBubble(text, duration) {
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleEl.textContent = text;
    bubbleEl.classList.remove('hide');
    bubbleEl.classList.add('show');
    bubbleTimer = setTimeout(() => {
      bubbleEl.classList.remove('show');
      bubbleEl.classList.add('hide');
      setTimeout(() => {
        bubbleEl.classList.remove('hide');
        bubbleEl.textContent = '';
      }, 220);
    }, duration || 3500);
  }

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // タップで話しかける
  imgEl.addEventListener('click', () => {
    const msgs = getMessages();
    showBubble(pickRandom(msgs), 3500);
  });

  // 画面切り替え時に一言
  document.addEventListener('screenChanged', e => {
    const screenMsgs = {
      calendar: [
        'カレンダーだよ！\n今日の予定は？',
        'きょうはなにする？',
        'かくさんと一緒に\nリズム作ろうね！',
      ],
      tasks: [
        'タスク一覧だよ！\nこなせたらえらい！',
        'まずは1個から！',
        'かくさん、全部\n応援してるよ〜！',
      ],
      period: [
        'からだの記録\nちゃんとつけてえらい！',
        'じぶんを大切にね！',
        'かくさんも心配して\nみてるからね…！',
      ],
      settings: [
        '設定画面だよ！\nカスタマイズしてね',
        'おうちに合わせてね！',
        'かくさんの設定も\nここにあるよ〜',
      ],
    };
    const msgs = screenMsgs[e.detail];
    if (msgs) setTimeout(() => showBubble(pickRandom(msgs), 2800), 400);
  });

  // タスク完了時に一言（welcomeパネルのクリックイベントの後）
  document.addEventListener('taskCompleted', () => {
    const cheerMsgs = [
      'やった！えらい〜！！',
      'できたね！すごい！',
      'ひとつ片付いた！\nえらすぎ！',
      // かくさん自身の話
      'かくさん、感激して\nるよ…！！',
      'わたし、ずっと\n見てたよ！えらい！',
    ];
    showBubble(pickRandom(cheerMsgs), 3000);
  });

  // 30秒ごとにアイドルセリフをランダム表示
  setInterval(() => {
    if (bubbleEl.textContent) return; // 表示中は割り込まない
    const msgs = getMessages();
    showBubble(pickRandom(msgs), 3000);
  }, 30000);

  // 初回：3秒後に挨拶 → 5秒後に未完了タスクがあればリマインド
  setTimeout(() => {
    const h = new Date().getHours();
    const greet = h < 10 ? 'おはよう！\nよろしくね！'
                : h < 17 ? 'こんにちは！\nよろしくね！'
                : 'おかえり！\nよろしくね！';
    showBubble(greet, 3000);

    // 5秒後：今日期限のタスクがあればリマインド
    setTimeout(() => {
      const today = D.today();
      const tasks = DB.get(DB.K.tasks);
      const logs  = DB.get(DB.K.logs);
      const overdueTodayTasks = tasks.filter(t => {
        const due = daysUntilDue(t);
        return (due <= 0) && !isDoneOn(t.id, today) && t.cycle !== 'none';
      });
      if (overdueTodayTasks.length > 0) {
        const names = overdueTodayTasks.slice(0, 2).map(t => t.name).join('・');
        const msg = overdueTodayTasks.length === 1
          ? `「${names}」\nが今日期限だよ！`
          : `「${names}」\nなど${overdueTodayTasks.length}件が期限だよ！`;
        showBubble(msg, 5000);
      }
    }, 5000);
  }, 3000);
})();

// ----------------------------------------------------------------
// プルトゥリフレッシュ（画面下スクロールでデータ更新）
// ----------------------------------------------------------------
(function initPullToRefresh() {
  let startY = 0;
  let pulling = false;

  // スマホ（max-width: 767px）のみ有効
  const screens = document.getElementById('pc-main');
  if (!screens) return;

  screens.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
    pulling = false;
  }, { passive: true });

  screens.addEventListener('touchmove', e => {
    const deltaY = e.touches[0].clientY - startY;
    // 下方向にスクロールし、かつページが一番下に来ているとき
    const el = e.target.closest('.screen.active') || document.querySelector('.screen.active');
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
    if (deltaY < -50 && atBottom) {
      pulling = true;
    }
  }, { passive: true });

  screens.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    showToast('更新しました');
    renderCalendar();
    renderTaskList();
  });
})();
