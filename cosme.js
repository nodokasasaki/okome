/* ================================================================
   コスメ管理 — 画面描画・モーダル・消費ペース予測
   データ: DB.K.cosmetics = [{ id, name, category, openedAt, finishedAt|null, memo, createdAt }]
   依存: cosme-master.js / app.js（DB, D, uid, showToast, _escapeHtml）
   ※ app.js より後に読み込む（トップレベルで参照するのはイベント登録のみ）
   ================================================================ */

const COSME_DAYS_PER_MONTH = 30.44;
const COSME_NAME_MAX = 60;
const COSME_MEMO_MAX = 200;

// 名前からカテゴリを推定する（上から順に最初に当たったもの）
const COSME_KEYWORDS = [
  ['cleansing',  ['クレンジング', 'メイク落とし']],
  ['facewash',   ['洗顔', 'フェイスウォッシュ']],
  ['sunscreen',  ['日焼け止め', 'UV', 'サンスクリーン']],
  ['base',       ['下地']],
  ['foundation', ['ファンデ']],
  ['powder',     ['パウダー']],
  ['mascara',    ['マスカラ']],
  ['eyeliner',   ['ライナー']],
  ['lip',        ['リップ', 'ティント']],
  ['mask',       ['パック', 'マスク']],
  ['hair',       ['シャンプー', 'トリートメント', 'ヘア', 'コンディショナー']],
  ['body',       ['ボディ', 'ハンド']],
  ['serum',      ['美容液', 'セラム', 'エッセンス']],
  ['emulsion',   ['乳液', 'ミルク']],
  ['lotion',     ['化粧水', 'ローション']],
  ['cream',      ['クリーム']],
];

function cosmeGuessCategory(name) {
  const n = cosmeNormalize(name);
  if (!n) return null;
  for (const [cat, words] of COSME_KEYWORDS) {
    if (words.some(w => n.includes(cosmeNormalize(w)))) return cat;
  }
  return null;
}

function cosmeGetItems() { return DB.get(DB.K.cosmetics); }

function cosmeDays(item) {
  return Math.max(0, D.diff(item.finishedAt || D.today(), item.openedAt));
}

function cosmeMonthsText(days) {
  return String(Math.round(days / COSME_DAYS_PER_MONTH * 10) / 10);
}

const cosmeAvg = arr => arr.reduce((s, v) => s + v, 0) / arr.length;

// 使い切りまでの予測日数: 同じ製品の実績 → 同カテゴリの実績 → 一般的な目安
function cosmePredict(item, finished) {
  const usable = finished.filter(f => f.id !== item.id && cosmeDays(f) >= 1);
  const key = cosmeNormalize(item.name);
  const same = usable.filter(f => cosmeNormalize(f.name) === key);
  if (same.length) {
    return { days: Math.round(cosmeAvg(same.map(cosmeDays))), source: `同じ製品の実績${same.length}回の平均` };
  }
  const label = COSME_CATEGORIES[item.category]?.label || 'その他';
  const sameCat = usable.filter(f => f.category === item.category);
  if (sameCat.length) {
    return { days: Math.round(cosmeAvg(sameCat.map(cosmeDays))), source: `${label}の実績${sameCat.length}回の平均` };
  }
  const months = (COSME_CATEGORIES[item.category] || COSME_CATEGORIES.other).months;
  return { days: Math.round(months * COSME_DAYS_PER_MONTH), source: `${label}の一般的な目安` };
}

// ----------------------------------------------------------------
// Tips（日替わり。「次のTips」で切り替え、「一覧を見る」で全件表示）
// ----------------------------------------------------------------
let _cosmeTipOffset = 0;     // 「次のTips」を押した回数（画面を開き直すと日替わりに戻る）
let _cosmeTipsOpen  = false; // 一覧の開閉

function _cosmeCurrentTip(active) {
  const cats = [...new Set(active.map(i => i.category))];
  const pool = cats.length && COSME_TIPS.some(t => t.cat && cats.includes(t.cat))
    ? COSME_TIPS.filter(t => t.cat && cats.includes(t.cat))
    : COSME_TIPS;
  const base = pool.indexOf(cosmePickTip(cats, D.today()));
  return pool[(base + _cosmeTipOffset) % pool.length];
}

function cosmeTipHtml(active) {
  const esc = s => _escapeHtml(String(s ?? ''));
  const tip = _cosmeCurrentTip(active);
  const list = _cosmeTipsOpen ? `
    <div class="cosme-tips-list">
      ${Object.entries(COSME_TIP_GROUPS).map(([g, label]) => `
        <div class="cosme-tips-group">${esc(label)}</div>
        ${COSME_TIPS.filter(t => t.group === g).map(t => `
          <details class="cosme-tips-item">
            <summary>${esc(t.title)}</summary>
            <p>${esc(t.body)}</p>
          </details>`).join('')}
      `).join('')}
    </div>` : '';
  return `
    <div class="cosme-tip">
      <div class="cosme-tip-head">
        <span class="cosme-tip-label">スキンケアTips</span>
        <span class="cosme-tip-group">${esc(COSME_TIP_GROUPS[tip.group])}</span>
      </div>
      <div class="cosme-tip-title">${esc(tip.title)}</div>
      <div class="cosme-tip-body">${esc(tip.body)}</div>
      <div class="cosme-tip-actions">
        <button class="cosme-btn cosme-btn-sm" data-act="tip-next">次のTips</button>
        <button class="cosme-btn cosme-btn-sm" data-act="tip-list">${_cosmeTipsOpen ? '一覧を閉じる' : '一覧を見る'}</button>
      </div>
      ${list}
      <div class="cosme-tip-note">一般的な情報です。肌に合わないときは使用を中止し、症状が続く場合は医療機関に相談してください。</div>
    </div>`;
}

// ----------------------------------------------------------------
// 描画
// ----------------------------------------------------------------
function renderCosme() {
  const body = document.getElementById('cosme-body');
  if (!body) return;

  const items    = cosmeGetItems();
  // 使用中はスキンケアで使う順（同じカテゴリ内は使い始めた日の古い順）
  const active   = items.filter(i => !i.finishedAt).sort((a, b) =>
    cosmeCategoryRank(a.category) - cosmeCategoryRank(b.category) || a.openedAt.localeCompare(b.openedAt));
  const finished = items.filter(i => i.finishedAt).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));
  const esc = s => _escapeHtml(String(s ?? ''));

  const subText = `使用中 ${active.length}個 ・ 使い切り ${finished.length}個`;
  const sub = document.getElementById('cosme-sub');
  if (sub) sub.textContent = subText;
  const subPc = document.getElementById('cosme-sub-pc');
  if (subPc) subPc.textContent = subText;

  if (!items.length) {
    body.innerHTML = `
      <div class="empty-state">
        <div style="font-size:15px;font-weight:800;color:var(--g800);margin-bottom:6px;">コスメの消費リズムを記録しよう</div>
        <div style="font-size:12px;line-height:1.8;">使っている化粧品を登録して、使い切ったら記録。<br>何ヶ月で使い切るかが見えて、買い替えの目安になります。</div>
        <button class="btn-primary" style="max-width:260px;margin:18px auto 0;" id="btn-cosme-empty-add">最初のコスメを登録</button>
      </div>
      ${cosmeTipHtml([])}`;
    return;
  }

  // サマリー
  const doneDays = finished.map(cosmeDays).filter(d => d >= 1);
  let summaryHtml = '';
  if (doneDays.length) {
    const byCat = {};
    finished.forEach(f => {
      const d = cosmeDays(f);
      if (d < 1) return;
      (byCat[f.category] = byCat[f.category] || []).push(d);
    });
    const chips = Object.entries(byCat)
      .sort((a, b) => cosmeCategoryRank(a[0]) - cosmeCategoryRank(b[0]))
      .map(([cat, ds]) => `<span class="cosme-chip">${esc(COSME_CATEGORIES[cat]?.label || 'その他')} <b>${cosmeMonthsText(cosmeAvg(ds))}ヶ月</b><small>（${ds.length}回）</small></span>`)
      .join('');
    summaryHtml = `
      <div class="cosme-summary">
        <div class="cosme-summary-main"><span class="cosme-summary-num">${cosmeMonthsText(cosmeAvg(doneDays))}</span><span class="cosme-summary-unit">ヶ月</span></div>
        <div class="cosme-summary-label">使い切るまでの平均（全${doneDays.length}回）</div>
        <div class="cosme-chips">${chips}</div>
      </div>`;
  }

  // 使用中
  const activeHtml = active.length ? active.map(i => {
    const days = cosmeDays(i);
    const pred = cosmePredict(i, finished);
    const pct  = Math.min(100, Math.round(days / Math.max(1, pred.days) * 100));
    const left = pred.days - days;
    const over = left < 0;
    const eta  = D.addDays(i.openedAt, pred.days);
    const msg  = over
      ? `目安を${-left}日過ぎています`
      : left === 0 ? '今日が使い切りの目安です'
      : `使い切りの目安まで あと約${left}日（${D.jpShort(eta)}頃）`;
    return `
      <div class="cosme-card">
        <div class="cosme-card-top">
          <div class="cosme-card-name">${esc(i.name)}</div>
          <span class="cosme-pill">${esc(COSME_CATEGORIES[i.category]?.label || 'その他')}</span>
        </div>
        <div class="cosme-card-meta">${D.jpShort(i.openedAt)} から使用中 ・ <b>${cosmeMonthsText(days)}ヶ月</b>（${days}日目）</div>
        <div class="cosme-bar"><div class="cosme-bar-fill ${over ? 'over' : ''}" style="width:${pct}%;"></div></div>
        <div class="cosme-card-msg ${over ? 'over' : ''}">${msg}</div>
        <div class="cosme-card-src">${esc(pred.source)}をもとに予測</div>
        <div class="cosme-card-actions">
          <button class="cosme-btn cosme-btn-main" data-act="finish" data-id="${esc(i.id)}">使い切った</button>
          <button class="cosme-btn" data-act="edit" data-id="${esc(i.id)}">編集</button>
        </div>
      </div>`;
  }).join('') : `<div class="cosme-none">使用中のコスメはありません</div>`;

  // 使い切り履歴
  const finishedHtml = finished.length ? finished.map(i => {
    const days = cosmeDays(i);
    return `
      <div class="cosme-hist" data-act="edit" data-id="${esc(i.id)}">
        <div class="cosme-hist-main">
          <div class="cosme-hist-name">${esc(i.name)}</div>
          <div class="cosme-hist-meta">${esc(COSME_CATEGORIES[i.category]?.label || 'その他')} ・ ${D.jpShort(i.openedAt)} → ${D.jpShort(i.finishedAt)}</div>
        </div>
        <div class="cosme-hist-months"><b>${cosmeMonthsText(days)}</b>ヶ月<small>${days}日</small></div>
        <button class="cosme-btn cosme-btn-sm" data-act="again" data-id="${esc(i.id)}">また使う</button>
      </div>`;
  }).join('') : `<div class="cosme-none">使い切ったコスメを記録すると、ここに履歴が並びます</div>`;

  body.innerHTML = `
    ${summaryHtml}
    ${cosmeTipHtml(active)}
    <div class="setting-section-header">使用中<span class="cosme-order-note">スキンケアで使う順</span></div>
    <div class="cosme-list">${activeHtml}</div>
    <div class="setting-section-header">使い切り履歴</div>
    <div class="cosme-list">${finishedHtml}</div>`;
}

// ----------------------------------------------------------------
// モーダル
// ----------------------------------------------------------------
let _cosmeCategoryDirty = false;   // ユーザーがカテゴリを手動変更したか
let _cosmeSuggestList   = [];

function _cosmeEl(id) { return document.getElementById(id); }

function _cosmeFillCategorySelect() {
  const sel = _cosmeEl('input-cosme-category');
  if (!sel || sel.options.length) return;
  Object.entries(COSME_CATEGORIES).forEach(([id, c]) => {
    const o = document.createElement('option');
    o.value = id; o.textContent = c.label;
    sel.appendChild(o);
  });
}

function openCosmeModal(itemId = null, preset = null) {
  _cosmeFillCategorySelect();
  const item = itemId ? cosmeGetItems().find(i => i.id === itemId) : null;
  const src  = item || preset || {};
  _cosmeEl('input-cosme-id').value        = item ? item.id : '';
  _cosmeEl('input-cosme-name').value      = src.name || '';
  _cosmeEl('input-cosme-category').value  = COSME_CATEGORIES[src.category] ? src.category : 'lotion';
  _cosmeEl('input-cosme-opened').value    = item ? item.openedAt : D.today();
  _cosmeEl('input-cosme-opened').max      = D.today();
  _cosmeEl('input-cosme-finished').value  = item?.finishedAt || '';
  _cosmeEl('input-cosme-finished').max    = D.today();
  _cosmeEl('input-cosme-memo').value      = item?.memo || '';
  _cosmeEl('cosme-modal-title-text').textContent = item ? 'コスメを編集' : 'コスメを登録';
  _cosmeEl('btn-delete-cosme').style.display = item ? '' : 'none';
  _cosmeCategoryDirty = !!(item || preset);
  _cosmeHideSuggest();
  _cosmeEl('modal-cosme').classList.remove('hidden');
}

function closeCosmeModal() {
  _cosmeEl('modal-cosme').classList.add('hidden');
  _cosmeHideSuggest();
}

function _cosmeHideSuggest() {
  const box = _cosmeEl('cosme-suggest');
  if (box) { box.innerHTML = ''; box.style.display = 'none'; }
  _cosmeSuggestList = [];
}

function _cosmeUpdateSuggest() {
  const box = _cosmeEl('cosme-suggest');
  const q   = _cosmeEl('input-cosme-name').value;

  if (!_cosmeCategoryDirty) {
    const guess = cosmeGuessCategory(q);
    if (guess) _cosmeEl('input-cosme-category').value = guess;
  }

  _cosmeSuggestList = cosmeSuggest(q, cosmeGetItems());
  // 入力が候補と完全一致しているときは出さない
  if (_cosmeSuggestList.length === 1 && cosmeNormalize(_cosmeSuggestList[0].name) === cosmeNormalize(q)) {
    _cosmeSuggestList = [];
  }
  if (!_cosmeSuggestList.length) { _cosmeHideSuggest(); return; }

  box.innerHTML = _cosmeSuggestList.map((s, idx) => `
    <button type="button" class="cosme-suggest-item" data-idx="${idx}">
      <span class="cosme-suggest-name">${_escapeHtml(s.name)}</span>
      <span class="cosme-suggest-sub">${_escapeHtml(COSME_CATEGORIES[s.category].label)}${s.fromHistory ? ' ・ 履歴' : ''}</span>
    </button>`).join('');
  box.style.display = 'block';
}

function saveCosme() {
  const name     = _cosmeEl('input-cosme-name').value.trim();
  const category = _cosmeEl('input-cosme-category').value;
  const opened   = _cosmeEl('input-cosme-opened').value;
  const finished = _cosmeEl('input-cosme-finished').value || null;
  const memo     = _cosmeEl('input-cosme-memo').value.trim();
  const today    = D.today();
  const datePat  = /^\d{4}-\d{2}-\d{2}$/;

  if (!name)                         { showToast('コスメの名前を入力してください'); return; }
  if (name.length > COSME_NAME_MAX)  { showToast(`名前は${COSME_NAME_MAX}文字以内にしてください`); return; }
  if (!COSME_CATEGORIES[category])   { showToast('カテゴリを選んでください'); return; }
  if (!datePat.test(opened))         { showToast('使い始めた日を入力してください'); return; }
  if (opened > today)                { showToast('使い始めた日は今日以前にしてください'); return; }
  if (finished) {
    if (!datePat.test(finished))     { showToast('使い切った日が正しくありません'); return; }
    if (finished < opened)           { showToast('使い切った日は使い始めた日以降にしてください'); return; }
    if (finished > today)            { showToast('使い切った日は今日以前にしてください'); return; }
  }
  if (memo.length > COSME_MEMO_MAX)  { showToast(`メモは${COSME_MEMO_MAX}文字以内にしてください`); return; }

  const id    = _cosmeEl('input-cosme-id').value;
  const items = cosmeGetItems();
  let next;
  if (id) {
    next = items.map(i => i.id === id ? { ...i, name, category, openedAt: opened, finishedAt: finished, memo } : i);
  } else {
    next = [...items, { id: uid(), name, category, openedAt: opened, finishedAt: finished, memo, createdAt: new Date().toISOString() }];
  }
  DB.set(DB.K.cosmetics, next);
  closeCosmeModal();
  renderCosme();
  showToast(id ? '更新しました' : '登録しました');
}

function deleteCosme() {
  const id = _cosmeEl('input-cosme-id').value;
  if (!id || !confirm('このコスメの記録を削除します。')) return;
  DB.set(DB.K.cosmetics, cosmeGetItems().filter(i => i.id !== id));
  closeCosmeModal();
  renderCosme();
  showToast('削除しました');
}

function finishCosme(id) {
  const items = cosmeGetItems();
  const item  = items.find(i => i.id === id);
  if (!item) return;
  const today = D.today();
  const days  = Math.max(0, D.diff(today, item.openedAt));
  DB.set(DB.K.cosmetics, items.map(i => i.id === id ? { ...i, finishedAt: today } : i));
  renderCosme();
  showToast(`${cosmeMonthsText(days)}ヶ月で使い切りました`);
}

// ----------------------------------------------------------------
// イベント
// ----------------------------------------------------------------
function bindCosmeEvents() {
  _cosmeEl('btn-add-cosme')?.addEventListener('click', () => openCosmeModal());
  _cosmeEl('btn-add-cosme-pc')?.addEventListener('click', () => openCosmeModal());
  _cosmeEl('modal-cosme-close')?.addEventListener('click', closeCosmeModal);
  _cosmeEl('modal-cosme')?.addEventListener('click', e => {
    if (e.target === _cosmeEl('modal-cosme')) closeCosmeModal();
  });
  _cosmeEl('btn-save-cosme')?.addEventListener('click', saveCosme);
  _cosmeEl('btn-delete-cosme')?.addEventListener('click', deleteCosme);
  _cosmeEl('btn-clear-cosme-finished')?.addEventListener('click', () => { _cosmeEl('input-cosme-finished').value = ''; });

  _cosmeEl('input-cosme-name')?.addEventListener('input', _cosmeUpdateSuggest);
  _cosmeEl('input-cosme-category')?.addEventListener('change', () => { _cosmeCategoryDirty = true; });

  _cosmeEl('cosme-suggest')?.addEventListener('click', e => {
    const btn = e.target.closest('.cosme-suggest-item');
    if (!btn) return;
    const s = _cosmeSuggestList[Number(btn.dataset.idx)];
    if (!s) return;
    _cosmeEl('input-cosme-name').value     = s.name;
    _cosmeEl('input-cosme-category').value = s.category;
    _cosmeCategoryDirty = true;
    _cosmeHideSuggest();
  });

  _cosmeEl('cosme-body')?.addEventListener('click', e => {
    if (e.target.closest('#btn-cosme-empty-add')) { openCosmeModal(); return; }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const id = el.dataset.id;
    const act = el.dataset.act;
    if (act === 'tip-next') { _cosmeTipOffset++; renderCosme(); return; }
    if (act === 'tip-list') { _cosmeTipsOpen = !_cosmeTipsOpen; renderCosme(); return; }
    if (act === 'finish') finishCosme(id);
    else if (act === 'edit') openCosmeModal(id);
    else if (act === 'again') {
      const src = cosmeGetItems().find(i => i.id === id);
      if (src) openCosmeModal(null, { name: src.name, category: src.category });
    }
  });
}

bindCosmeEvents();
