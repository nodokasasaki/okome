/* ================================================================
   コスメ管理 — カテゴリ定義・同梱製品マスタ・候補検索
   外部APIは使わず、このファイル内のデータだけで候補を出す（完全無料）。
   マスタに無い製品は自由入力で登録でき、入力済みの名前は次回から
   「自分の履歴」として候補に出る。
   ================================================================ */

// 並び順 = スキンケアで使う順番（クレンジング → 洗顔 → 化粧水 → … → 日焼け止め → メイク）。
// 使用中リスト・平均月数・登録画面のカテゴリ選択は、すべてこの定義順で並ぶ。
// months: 使い切りまでの目安（月）。ユーザー自身の記録が無い場合の予測にだけ使う
const COSME_CATEGORIES = {
  cleansing:  { label: 'クレンジング',   months: 3 },
  facewash:   { label: '洗顔料',         months: 3 },
  lotion:     { label: '化粧水',         months: 2 },
  mask:       { label: 'パック・マスク', months: 1 },
  serum:      { label: '美容液',         months: 2 },
  emulsion:   { label: '乳液',           months: 2 },
  cream:      { label: 'クリーム',       months: 3 },
  sunscreen:  { label: '日焼け止め',     months: 3 },
  base:       { label: '化粧下地',       months: 3 },
  foundation: { label: 'ファンデーション', months: 4 },
  powder:     { label: 'パウダー',       months: 6 },
  mascara:    { label: 'マスカラ',       months: 3 },
  eyeliner:   { label: 'アイライナー',   months: 3 },
  lip:        { label: 'リップ',         months: 4 },
  body:       { label: 'ボディ・ハンド', months: 3 },
  hair:       { label: 'ヘアケア',       months: 2 },
  other:      { label: 'その他',         months: 3 },
};

const COSME_ORDER = Object.keys(COSME_CATEGORIES);
// 使う順の位置（未知のカテゴリは末尾）
function cosmeCategoryRank(cat) {
  const i = COSME_ORDER.indexOf(cat);
  return i === -1 ? COSME_ORDER.length : i;
}

// [表示名, カテゴリ, 読み(漢字・英字を含む名前だけ。ひらがな)]
const COSME_MASTER = [
  // クレンジング
  ['ファンケル マイルドクレンジング オイル', 'cleansing'],
  ['DUO ザ クレンジングバーム', 'cleansing', 'でゅお'],
  ['ソフティモ スピーディクレンジングオイル', 'cleansing'],
  ['ビオレ ザクレンズ オイルメイク落とし', 'cleansing'],
  ['ビフェスタ うる落ち水クレンジング', 'cleansing'],
  ['無印良品 オイルクレンジング', 'cleansing', 'むじるしりょうひん むじ'],
  ['マナラ ホットクレンジングゲル', 'cleansing'],
  ['オルビス クレンジングリキッド', 'cleansing'],
  ['ちふれ クレンジングオイル', 'cleansing'],
  // 洗顔料
  ['洗顔専科 パーフェクトホイップ', 'facewash', 'せんがんせんか'],
  ['キュレル 泡洗顔料', 'facewash', 'きゅれる あわせんがんりょう'],
  ['ミノン アミノモイスト ジェントルウォッシュ ホイップ', 'facewash'],
  ['ファンケル 洗顔パウダー', 'facewash', 'せんがんぱうだー'],
  ['無印良品 敏感肌用洗顔フォーム', 'facewash', 'むじるしりょうひん むじ'],
  ['SK-II フェイシャル トリートメント クレンザー', 'facewash', 'えすけーつー'],
  // 化粧水
  ['無印良品 化粧水・敏感肌用 高保湿タイプ', 'lotion', 'むじるしりょうひん むじ けしょうすい'],
  ['ナチュリエ ハトムギ化粧水', 'lotion', 'はとむぎけしょうすい'],
  ['キュレル 潤浸保湿 化粧水', 'lotion', 'きゅれる じゅんしんほしつ けしょうすい'],
  ['ミノン アミノモイスト モイストチャージ ローション', 'lotion'],
  ['肌ラボ 極潤 ヒアルロン液', 'lotion', 'はだらぼ ごくじゅん'],
  ['コーセー 薬用 雪肌精', 'lotion', 'こーせー やくよう せっきせい'],
  ['SK-II フェイシャル トリートメント エッセンス', 'lotion', 'えすけーつー ぴてら'],
  ['エリクシール シュペリエル リフトモイスト ローション', 'lotion'],
  ['ちふれ 化粧水 しっとりタイプ', 'lotion', 'けしょうすい'],
  ['オルビスユー ローション', 'lotion'],
  ['ドクターシーラボ VC100エッセンスローションEX', 'lotion'],
  // 乳液
  ['無印良品 乳液・敏感肌用 高保湿タイプ', 'emulsion', 'むじるしりょうひん むじ にゅうえき'],
  ['キュレル 潤浸保湿 乳液', 'emulsion', 'きゅれる じゅんしんほしつ にゅうえき'],
  ['ミノン アミノモイスト モイストチャージ ミルク', 'emulsion'],
  ['ちふれ 乳液 しっとりタイプ', 'emulsion', 'にゅうえき'],
  ['肌ラボ 極潤 ヒアルロン乳液', 'emulsion', 'はだらぼ ごくじゅん にゅうえき'],
  ['エリクシール シュペリエル リフトモイスト エマルジョン', 'emulsion'],
  // 美容液
  ['オバジ C25セラム NEO', 'serum'],
  ['ザ・オーディナリー ナイアシンアミド 10% + 亜鉛 1%', 'serum', 'ざおーでぃなりー'],
  ['無印良品 導入美容液', 'serum', 'むじるしりょうひん むじ どうにゅうびようえき'],
  ['メラノCC 薬用しみ集中対策 美容液', 'serum', 'ろーとせいやく めらのしーしー'],
  // クリーム
  ['ニベア クリーム(青缶)', 'cream', 'にべあくりーむ あおかん'],
  ['ヴァセリン ペトロリュームジェリー', 'cream', 'ばせりん わせりん'],
  ['アクアレーベル スペシャルジェルクリーム', 'cream'],
  ['キュレル 潤浸保湿 フェイスクリーム', 'cream', 'きゅれる じゅんしんほしつ'],
  // 日焼け止め
  ['アネッサ パーフェクトUV スキンケアミルク', 'sunscreen'],
  ['ビオレUV アクアリッチ ウォータリーエッセンス', 'sunscreen'],
  ['スキンアクア トーンアップUVエッセンス', 'sunscreen'],
  ['ニベアUV ウォータージェル', 'sunscreen'],
  ['ラロッシュポゼ UVイデア XL プロテクショントーンアップ', 'sunscreen'],
  ['アリィー クロノビューティ ジェルUV EX', 'sunscreen', 'ありー'],
  // 化粧下地
  ['セザンヌ 皮脂テカリ防止下地', 'base', 'せざんぬ ひしてかりぼうしした'],
  // ファンデーション
  ['メイベリン フィットミー リキッドファンデーション', 'foundation'],
  ['マキアージュ ドラマティックパウダリー UV', 'foundation'],
  // パウダー
  ['キャンメイク マシュマロフィニッシュパウダー', 'powder'],
  ['セザンヌ UVクリアフェイスパウダー', 'powder'],
  // マスカラ
  ['ヒロインメイク ロングUPマスカラ', 'mascara'],
  ['フローフシ モテマスカラ', 'mascara'],
  ['キャンメイク クイックラッシュカーラー', 'mascara'],
  ['デジャヴュ ラスティンファイン 塗るつけまつげ', 'mascara', 'でじゃゔゅ'],
  // アイライナー
  ['ラブ・ライナー リキッド', 'eyeliner', 'らぶらいなー'],
  ['ヒロインメイク スムースリキッドアイライナー', 'eyeliner'],
  ['ケイト スーパーシャープライナー', 'eyeliner'],
  // リップ
  ['メンソレータム 薬用リップスティックXD', 'lip'],
  ['ニベア ディープモイスチャーリップ', 'lip'],
  ['ケイト リップモンスター', 'lip'],
  ['rom&nd ジューシーラスティングティント', 'lip', 'ろむあんど'],
  // パック・マスク
  ['ルルルン フェイスマスク', 'mask'],
  ['メディヒール N.M.F アクアアンプルマスク', 'mask'],
  // ボディ・ハンド
  ['ヴァセリン アドバンスドリペア ボディローション', 'body', 'ばせりん'],
  ['ユースキンA', 'body', 'ゆーすきん'],
  // ヘアケア
  ['ラックス ルミニーク シャンプー', 'hair'],
  ['パンテーン ミラクルズ', 'hair'],
  ['いち髪 ナチュラルケア', 'hair', 'いちかみ'],
  ['ボタニスト ボタニカルシャンプー', 'hair'],
  ['ダイアン パーフェクトビューティー', 'hair'],
];

// 全角半角・大小文字・カタカナ/ひらがな・記号/空白の違いを吸収して比較する
function cosmeNormalize(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s\u3000・･\-ー_.,/()（）「」『』]/g, '');
}

// 検索用キーを事前計算（製品名 + カテゴリ名 + 読み）
const _COSME_INDEX = COSME_MASTER.map(([name, cat, reading]) => ({
  name,
  category: cat,
  nameKey: cosmeNormalize(name),
  readingKey: cosmeNormalize(reading || ''),
  key: cosmeNormalize(`${name} ${COSME_CATEGORIES[cat].label} ${reading || ''}`),
}));

/**
 * 候補を返す。
 * @param {string} query            入力中の文字列
 * @param {Array}  history          自分の登録済みアイテム [{name, category}]
 * @param {number} limit            最大件数
 * @returns {Array<{name, category, fromHistory}>}
 */
function cosmeSuggest(query, history = [], limit = 8) {
  const tokens = String(query ?? '').normalize('NFKC').trim().split(/\s+/)
    .map(cosmeNormalize).filter(Boolean);
  if (cosmeNormalize(query).length < 2) return [];

  const seen = new Set();
  const results = [];
  const push = (entry, fromHistory) => {
    if (seen.has(entry.nameKey)) return;
    const hit = tokens.every(t => entry.key.includes(t));
    if (!hit) return;
    seen.add(entry.nameKey);
    const first = tokens[0];
    // 名前・読みの先頭一致 → 名前の途中一致 → それ以外（読み・カテゴリ名での一致）の順
    const match = (entry.nameKey.startsWith(first) || (entry.readingKey || '').startsWith(first)) ? 0
                : entry.nameKey.includes(first) ? 3 : 6;
    const rank = (fromHistory ? 0 : 10) + match;
    results.push({ name: entry.name, category: entry.category, fromHistory, rank });
  };

  // 自分の履歴（同名は1件に集約）
  history.forEach(h => {
    if (!h?.name) return;
    const cat = COSME_CATEGORIES[h.category] ? h.category : 'other';
    push({
      name: h.name,
      category: cat,
      nameKey: cosmeNormalize(h.name),
      key: cosmeNormalize(`${h.name} ${COSME_CATEGORIES[cat].label}`),
    }, true);
  });
  _COSME_INDEX.forEach(e => push(e, false));

  results.sort((a, b) => a.rank - b.rank || a.name.length - b.name.length);
  return results.slice(0, limit);
}
