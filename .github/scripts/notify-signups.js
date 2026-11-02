/**
 * おうちリズム — 新規ユーザーの Discord 通知スクリプト
 *
 * 動作：
 *   1. Firebase Auth の全ユーザーを「登録済み（non-anon）」と「匿名」に分類
 *   2. Firestore `_system/signupNotifier` に保存済みの「通知済みUID」と比較
 *   3. 未通知ユーザーがいれば Discord Webhook へ通知（メールアドレス等の個人情報は送らない）
 *      - 登録済みユーザーと匿名ユーザーをタグで分けて表示
 *   4. 通知に成功した場合のみ、通知済みUIDを更新（失敗時は次回再送）
 *
 * 初回実行時は既存ユーザーを通知済みとして記録するだけで、通知は送りません。
 *
 * 必要な GitHub Secrets:
 *   FIREBASE_ADMIN_SERVICE_ACCOUNT — Admin SDK のサービスアカウント JSON（文字列）
 *   DISCORD_WEBHOOK_URL            — Discord のチャンネル Webhook URL
 */

'use strict';

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const STATE_COLLECTION = '_system';
const STATE_DOC = 'signupNotifier';
const WEBHOOK_PREFIX = 'https://discord.com/api/webhooks/';
const FETCH_TIMEOUT_MS = 15000;
const DISCORD_MAX_LEN = 1900; // 上限 2000 文字に対する余裕

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`環境変数 ${name} が設定されていません`);
  return v;
}

function providerLabel(user) {
  const ids = user.providerData.map((p) => p.providerId);
  if (ids.includes('google.com')) return 'Google';
  if (ids.includes('password')) return 'メール/パスワード';
  return ids.join(', ') || '不明';
}

function formatJst(iso) {
  return new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour12: false,
  });
}

async function listAllUsers(auth) {
  const registered = []; // providerData あり（非匿名）
  const anonymous = [];  // providerData なし（匿名）
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    for (const u of res.users) {
      if (u.providerData.length > 0) {
        registered.push(u);
      } else {
        anonymous.push(u);
      }
    }
    pageToken = res.pageToken;
  } while (pageToken);
  return { registered, anonymous };
}

function buildMessage(newRegistered, newAnonymous, totalRegistered, totalAnonymous) {
  const sections = [];

  if (newRegistered.length > 0) {
    const header = `👤 [登録ユーザー] 新規 ${newRegistered.length}件 / 累計 ${totalRegistered}人`;
    const lines = newRegistered
      .sort((a, b) => new Date(a.metadata.creationTime) - new Date(b.metadata.creationTime))
      .map((u) => `・${providerLabel(u)}　${formatJst(u.metadata.creationTime)}`);
    let body = lines.join('\n');
    const room = DISCORD_MAX_LEN / 2 - header.length - 1;
    if (body.length > room) body = body.slice(0, room - 10) + '\n…ほか多数';
    sections.push(`${header}\n${body}`);
  }

  if (newAnonymous.length > 0) {
    const header = `👻 [匿名ユーザー] 新規 ${newAnonymous.length}件 / 累計 ${totalAnonymous}人`;
    const lines = newAnonymous
      .sort((a, b) => new Date(a.metadata.creationTime) - new Date(b.metadata.creationTime))
      .map((u) => `・匿名　${formatJst(u.metadata.creationTime)}`);
    let body = lines.join('\n');
    const room = DISCORD_MAX_LEN / 2 - header.length - 1;
    if (body.length > room) body = body.slice(0, room - 10) + '\n…ほか多数';
    sections.push(`${header}\n${body}`);
  }

  return sections.join('\n\n');
}

async function sendDiscord(webhookUrl, content) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Discord 通知に失敗しました (HTTP ${res.status})`);
  }
}

async function main() {
  const webhookUrl = requireEnv('DISCORD_WEBHOOK_URL');
  if (!webhookUrl.startsWith(WEBHOOK_PREFIX)) {
    throw new Error('DISCORD_WEBHOOK_URL の形式が不正です');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(requireEnv('FIREBASE_ADMIN_SERVICE_ACCOUNT'));
  } catch {
    throw new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT が正しい JSON ではありません');
  }

  initializeApp({ credential: cert(serviceAccount) });
  const auth = getAuth();
  const stateRef = getFirestore().collection(STATE_COLLECTION).doc(STATE_DOC);

  const { registered, anonymous } = await listAllUsers(auth);
  const allUsers = [...registered, ...anonymous];
  const snap = await stateRef.get();

  // 初回：ベースライン記録のみ（既存ユーザー分の大量通知を防ぐ）
  if (!snap.exists) {
    await stateRef.set({
      notifiedUids: allUsers.map((u) => u.uid),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.info(JSON.stringify({
      level: 'INFO',
      msg: 'baseline created',
      registered: registered.length,
      anonymous: anonymous.length,
    }));
    return;
  }

  const notified = new Set(snap.data().notifiedUids || []);
  const newRegistered = registered.filter((u) => !notified.has(u.uid));
  const newAnonymous = anonymous.filter((u) => !notified.has(u.uid));

  if (newRegistered.length === 0 && newAnonymous.length === 0) {
    console.info(JSON.stringify({ level: 'INFO', msg: 'no new signups' }));
    return;
  }

  const message = buildMessage(newRegistered, newAnonymous, registered.length, anonymous.length);
  await sendDiscord(webhookUrl, message);

  // 通知成功後に状態を更新（削除済みユーザーは自然に除外される）
  await stateRef.set({
    notifiedUids: allUsers.map((u) => u.uid),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.info(JSON.stringify({
    level: 'INFO',
    msg: 'notified',
    newRegistered: newRegistered.length,
    newAnonymous: newAnonymous.length,
  }));
}

main().catch((err) => {
  console.error(JSON.stringify({ level: 'ERROR', msg: err.message }));
  process.exit(1);
});
