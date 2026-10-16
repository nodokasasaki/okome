/**
 * おうちリズム — SNS自動投稿スクリプト（Bluesky版）
 *
 * 動作：
 *   1. 現在の曜日・月・季節をもとに投稿テーマを決定
 *   2. Gemini API で投稿文を生成
 *   3. Bluesky AT Protocol API で投稿（完全無料）
 *
 * 必要な GitHub Secrets:
 *   GEMINI_API_KEY      — Google AI Studio で取得
 *   BLUESKY_HANDLE      — 例: ouchirhythm.bsky.social
 *   BLUESKY_APP_PASSWORD — Bluesky設定 → アプリパスワード で生成
 */

'use strict';

const https = require('https');

// ----------------------------------------------------------------
// 設定
// ----------------------------------------------------------------
const APP_NAME = 'おうちリズム';
const APP_URL = 'https://kakusan-25200.web.app/lp/';
const HASHTAGS = '#家事 #掃除 #暮らし #おうちリズム';

// ----------------------------------------------------------------
// 投稿テーマ定義
// ----------------------------------------------------------------
const THEMES = [
  {
    type: 'tips',
    prompt: (ctx) =>
      `家事ライフハックや掃除のコツについて、具体的で実践しやすい投稿文を1つ書いてください。
      ${ctx.season}の季節感を取り入れるとなお良いです。
      最後に「${APP_NAME}で${ctx.taskExample}を登録して習慣化しよう」という自然な一言を添えてください。
      投稿文は140字以内、ハッシュタグは含めないでください。`,
  },
  {
    type: 'seasonal',
    prompt: (ctx) =>
      `${ctx.season}ならではの家事・掃除ネタについて投稿文を1つ書いてください。
      例：梅雨前のカビ対策、夏の冷蔵庫掃除、大掃除前の計画など。
      「${APP_NAME}でスケジュール管理すると楽になりますよ」という一言を自然に含めてください。
      140字以内、ハッシュタグは含めないでください。`,
  },
  {
    type: 'feature',
    prompt: (ctx) =>
      `家事管理ウェブアプリ「${APP_NAME}」の機能を1つ紹介する投稿文を書いてください。
      紹介できる機能：カレンダーで家事を一元管理／週1・月1・年1など周期設定／パートナーと家事共有／住居タイプ別タスク提案。
      ${ctx.dayOfWeek}らしい軽いトーンで、読んだ人が使いたくなるように書いてください。
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

// タスク例
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
// Gemini API で投稿文生成
// ----------------------------------------------------------------
async function generatePost(theme, ctx) {
  const models = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'];
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
            text: '家事・暮らし系SNSアカウントの運用担当です。フレンドリーで親しみやすく、実用的な投稿文を書きます。絵文字を1〜2個自然に使います。',
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
// Bluesky AT Protocol — セッション取得
// ----------------------------------------------------------------
function blueskyCreateSession(handle, appPassword) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      identifier: handle,
      password: appPassword,
    });

    const options = {
      hostname: 'bsky.social',
      path: '/xrpc/com.atproto.server.createSession',
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
          if (res.statusCode >= 400) {
            return reject(new Error(`Bluesky 認証エラー ${res.statusCode}: ${JSON.stringify(json)}`));
          }
          resolve(json); // { did, handle, accessJwt, ... }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Bluesky 認証タイムアウト'));
    });
    req.write(body);
    req.end();
  });
}

// ----------------------------------------------------------------
// Bluesky AT Protocol — 投稿
// ----------------------------------------------------------------
function blueskyPost(session, text) {
  return new Promise((resolve, reject) => {
    const record = {
      $type: 'app.bsky.feed.post',
      text,
      createdAt: new Date().toISOString(),
    };

    const body = JSON.stringify({
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record,
    });

    const options = {
      hostname: 'bsky.social',
      path: '/xrpc/com.atproto.repo.createRecord',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessJwt}`,
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
            return reject(new Error(`Bluesky 投稿エラー ${res.statusCode}: ${JSON.stringify(json)}`));
          }
          resolve(json); // { uri, cid }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('Bluesky 投稿タイムアウト'));
    });
    req.write(body);
    req.end();
  });
}

// ----------------------------------------------------------------
// Bluesky の文字数カウント（grapheme単位、300字制限）
// ----------------------------------------------------------------
function bskyLength(text) {
  // Bluesky は Intl.Segmenter がない環境でも [...text] でサロゲートペア対応
  return [...text].length;
}

// ----------------------------------------------------------------
// シークレット存在確認
// ----------------------------------------------------------------
function checkSecrets() {
  const required = ['GEMINI_API_KEY', 'BLUESKY_HANDLE', 'BLUESKY_APP_PASSWORD'];
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

  // 投稿文生成
  const baseText = await generatePost(theme, ctx);
  console.log(`[auto-post] 生成テキスト: ${baseText}`);

  // ハッシュタグ＋URLを付加（Bluesky は300字制限）
  const suffix = `\n\n${HASHTAGS}\n${APP_URL}`;
  const maxBodyLen = 300 - bskyLength(suffix);
  let trimmedBase = baseText;
  if (bskyLength(baseText) > maxBodyLen) {
    trimmedBase = [...baseText].slice(0, maxBodyLen - 1).join('') + '…';
  }
  const finalText = trimmedBase + suffix;

  console.log(`[auto-post] 最終テキスト（${bskyLength(finalText)}字）:\n${finalText}`);

  // Bluesky 認証
  const session = await blueskyCreateSession(
    process.env.BLUESKY_HANDLE,
    process.env.BLUESKY_APP_PASSWORD,
  );
  console.log(`[auto-post] Bluesky 認証成功: ${session.handle}`);

  // 投稿
  const result = await blueskyPost(session, finalText);
  console.log(`[auto-post] 投稿成功 uri=${result.uri}`);
}

main().catch((err) => {
  console.error('[auto-post] エラー:', err.message);
  process.exit(1);
});
