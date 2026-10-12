/**
 * おうちリズム — SNS自動投稿スクリプト
 *
 * 動作：
 *   1. 現在の曜日・月・季節をもとに投稿テーマを決定
 *   2. Gemini API でツイート文を生成
 *   3. X (Twitter) API v2 で投稿
 *
 * 必要な GitHub Secrets:
 *   GEMINI_API_KEY
 *   X_API_KEY
 *   X_API_SECRET
 *   X_ACCESS_TOKEN
 *   X_ACCESS_SECRET
 */

'use strict';

const https = require('https');
const crypto = require('crypto');

// ----------------------------------------------------------------
// 設定
// ----------------------------------------------------------------
const APP_NAME = 'おうちリズム';
const APP_URL = 'https://kakusan-25200.web.app/lp/';
const HASHTAGS = '#家事 #掃除 #暮らし #おうちリズム';

// ----------------------------------------------------------------
// 投稿テーマ定義
// 曜日・月・実行インデックスで循環し投稿内容を変化させる
// ----------------------------------------------------------------
const THEMES = [
  {
    type: 'tips',
    prompt: (ctx) =>
      `家事ライフハックや掃除のコツについて、具体的で実践しやすいツイートを1つ書いてください。
      ${ctx.season}の季節感を取り入れるとなお良いです。
      最後に「${APP_NAME}で${ctx.taskExample}を登録して習慣化しよう」という自然な一言を添えてください。
      ツイートは140字以内、ハッシュタグは含めないでください。`,
  },
  {
    type: 'seasonal',
    prompt: (ctx) =>
      `${ctx.season}ならではの家事・掃除ネタについてツイートを1つ書いてください。
      例：梅雨前のカビ対策、夏の冷蔵庫掃除、大掃除前の計画など。
      「${APP_NAME}でスケジュール管理すると楽になりますよ」という一言を自然に含めてください。
      140字以内、ハッシュタグは含めないでください。`,
  },
  {
    type: 'feature',
    prompt: (ctx) =>
      `家事管理ウェブアプリ「${APP_NAME}」の機能を1つ紹介するツイートを書いてください。
      紹介できる機能：カレンダーで家事を一元管理／週1・月1・年1など周期設定／パートナーと家事共有／住居タイプ別タスク提案。
      ${ctx.dayOfWeek}らしい軽いトーンで、フォロワーが使いたくなるように書いてください。
      140字以内、ハッシュタグは含めないでください。`,
  },
];

// 季節テキスト
function getSeason(month) {
  if (month >= 3 && month <= 5) return '春';
  if (month >= 6 && month <= 8) return '夏';
  if (month >= 9 && month <= 11) return '秋';
  return '冬';
}

// 曜日テキスト
const DAY_NAMES = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];

// タスク例（テーマに使用）
const TASK_EXAMPLES = [
  'トイレ掃除（週1）',
  'コンロ掃除（月1）',
  '浴室掃除（週1）',
  'エアコンフィルター掃除（3ヶ月に1回）',
  '窓拭き（年2回）',
  '排水口掃除（月1）',
];

// ----------------------------------------------------------------
// コンテキスト生成
// ----------------------------------------------------------------
function buildContext() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const day = now.getDay();
  // 投稿インデックスの優先順:
  //   1. POST_INDEX（手動実行で指定）
  //   2. GITHUB_RUN_NUMBER（Actions が毎回インクリメントする連番 → テーマが循環しズレる）
  //   3. 日にち（ローカル実行時のフォールバック）
  const idx = parseInt(
    process.env.POST_INDEX ||
    process.env.GITHUB_RUN_NUMBER ||
    String(now.getDate()),
    10,
  );

  return {
    month,
    season: getSeason(month),
    dayOfWeek: DAY_NAMES[day],
    taskExample: TASK_EXAMPLES[idx % TASK_EXAMPLES.length],
    themeIndex: idx % THEMES.length,
  };
}

// ----------------------------------------------------------------
// X の文字数カウント（twitter-text 相当）
//   - ASCII/半角1バイト文字 → 1カウント
//   - それ以外（日本語・全角など） → 2カウント
//   - URL は長さにかかわらず一律 23カウント
// ----------------------------------------------------------------
const URL_WEIGHT = 23; // X の t.co 短縮後の重み

function xWeightedLength(text) {
  // まず URL を URL_WEIGHT に置換して計算する
  const urlRegex = /https?:\/\/\S+/g;
  let length = 0;
  let lastIndex = 0;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    // URL より前の部分を計算
    const before = text.slice(lastIndex, match.index);
    for (const ch of before) {
      length += ch.codePointAt(0) <= 0x7f ? 1 : 2;
    }
    length += URL_WEIGHT;
    lastIndex = match.index + match[0].length;
  }
  // URL より後ろの残り部分
  const rest = text.slice(lastIndex);
  for (const ch of rest) {
    length += ch.codePointAt(0) <= 0x7f ? 1 : 2;
  }
  return length;
}

// ----------------------------------------------------------------
// Gemini API でツイート文生成
// ----------------------------------------------------------------
async function generateTweet(theme, ctx) {
  const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const model of models) {
    try {
      return await callGemini(model, theme, ctx);
    } catch (err) {
      lastError = err;
      console.warn(`[auto-post] ${model} での生成に失敗、次のモデルを試行します:`, err.message);
    }
  }

  throw lastError || new Error('Gemini API による生成に失敗しました');
}

function callGemini(model, theme, ctx) {
  return new Promise((resolve, reject) => {
    const prompt = theme.prompt(ctx);
    const body = JSON.stringify({
      system_instruction: {
        parts: [
          {
            text: '家事・暮らし系SNSアカウントの運用担当です。フレンドリーで親しみやすく、実用的なツイートを書きます。絵文字を1〜2個自然に使います。',
          },
        ],
      },
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 200,
      },
    });

    const apiKey = encodeURIComponent(process.env.GEMINI_API_KEY || '');
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(`Gemini error: ${json.error.message || JSON.stringify(json.error)}`));
          const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (!text) return reject(new Error('Gemini: 空のレスポンス'));
          resolve(text);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('Gemini API タイムアウト（30秒）'));
    });
    req.write(body);
    req.end();
  });
}

// ----------------------------------------------------------------
// X (Twitter) API v2 OAuth 1.0a 署名生成
// ----------------------------------------------------------------
function oauthSign(method, url, params, consumerKey, consumerSecret, tokenKey, tokenSecret) {
  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: tokenKey,
    oauth_version: '1.0',
    ...params,
  };

  const sortedKeys = Object.keys(oauthParams).sort();
  const paramStr = sortedKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
    .join('&');

  const baseStr = [method.toUpperCase(), encodeURIComponent(url), encodeURIComponent(paramStr)].join('&');
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseStr).digest('base64');

  oauthParams.oauth_signature = signature;

  const authHeader =
    'OAuth ' +
    Object.keys(oauthParams)
      .filter((k) => k.startsWith('oauth_'))
      .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
      .join(', ');

  return authHeader;
}

// ----------------------------------------------------------------
// X API v2 でツイート投稿
// ----------------------------------------------------------------
function postTweet(text) {
  return new Promise((resolve, reject) => {
    const url = 'https://api.twitter.com/2/tweets';
    const body = JSON.stringify({ text });

    const authHeader = oauthSign(
      'POST',
      url,
      {},
      process.env.X_API_KEY,
      process.env.X_API_SECRET,
      process.env.X_ACCESS_TOKEN,
      process.env.X_ACCESS_SECRET,
    );

    const options = {
      hostname: 'api.twitter.com',
      path: '/2/tweets',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            return reject(new Error(`X API error ${res.statusCode}: ${JSON.stringify(json)}`));
          }
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('X API タイムアウト（30秒）'));
    });
    req.write(body);
    req.end();
  });
}

// ----------------------------------------------------------------
// シークレット存在確認
// ----------------------------------------------------------------
function checkSecrets() {
  const required = ['GEMINI_API_KEY', 'X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`必須シークレットが未設定です: ${missing.join(', ')}`);
  }
}

// ----------------------------------------------------------------
// メイン
// ----------------------------------------------------------------
async function main() {
  console.log('[auto-post] 開始');

  checkSecrets();

  const ctx = buildContext();
  const theme = THEMES[ctx.themeIndex];

  console.log(`[auto-post] テーマ: ${theme.type} / 季節: ${ctx.season} / 曜日: ${ctx.dayOfWeek}`);

  // ツイート文生成
  const baseText = await generateTweet(theme, ctx);
  console.log(`[auto-post] 生成テキスト: ${baseText}`);

  // ハッシュタグ＋URLを付加
  // X の文字数カウント（日本語2、URL=23）で 280 以内に収める
  const suffix = `\n\n${HASHTAGS}\n${APP_URL}`;
  const suffixWeight = xWeightedLength(suffix);
  // 本文を X カウントで (280 - suffixWeight) 以内に切り詰める
  const maxBodyWeight = 280 - suffixWeight;
  let trimmedBase = baseText;
  if (xWeightedLength(baseText) > maxBodyWeight) {
    let w = 0;
    let i = 0;
    for (const ch of baseText) {
      const charW = ch.codePointAt(0) <= 0x7f ? 1 : 2;
      if (w + charW > maxBodyWeight - 2) break; // '…' は全角=2
      w += charW;
      i += ch.length; // サロゲートペア対応
    }
    trimmedBase = baseText.slice(0, i) + '…';
  }
  const finalText = trimmedBase + suffix;

  console.log(`[auto-post] 最終テキスト（X換算${xWeightedLength(finalText)}字）:\n${finalText}`);

  // 投稿
  const result = await postTweet(finalText);
  console.log(`[auto-post] 投稿成功 tweet_id=${result.data?.id}`);
}

main().catch((err) => {
  console.error('[auto-post] エラー:', err.message);
  process.exit(1);
});
