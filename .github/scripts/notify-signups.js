/**
 * おうちリズム — 新規登録者の Discord 通知スクリプト
 *
 * 動作：
 *   1. Firebase Auth の全ユーザーから「匿名ではない」登録済みユーザーを抽出
 *   2. Firestore `_system/signupNotifier` に保存済みの「通知済みUID」と比較
 *   3. 未通知ユーザーがいれば Discord Webhook へ通知（メールアドレス等の個人情報は送らない）
 *   4. 通知に成功した場合のみ、通知済みUIDを更新（失敗時は次回再送）
 *
 * 初回実行時は既存ユーザーを通知済みとして記録するだけで、通知は送りません。
 *
 * 必要な GitHub Secrets:
 *   FIREBASE_ADMIN_SERVICE_ACCOUNT — Admin SDK のサービスアカウント JSON（文字列）
 *   DISCORD_WEBHOOK_URL            — Discord のチャンネル Webhook URL
 */

'use strict';

const admin = require('firebase-admin');

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

async function listRegisteredUsers(auth) {
  const users = [];
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    for (const u of res.users) {
      // 匿名ユーザー（providerData が空）は対象外
      if (u.providerData.length > 0) users.push(u);
    }
    pageToken = res.pageToken;
  } while (pageToken);
  return users;
}

function buildMessage(newUsers, total) {
  const header = `🎉 おうちリズムに新規登録がありました（${newUsers.length}件 / 累計 ${total}人）`;
  const lines = newUsers.map(
    (u) => `・${providerLabel(u)}　${formatJst(u.metadata.creationTime)}`
  );
  let body = lines.join('\n');
  const room = DISCORD_MAX_LEN - header.length - 1;
  if (body.length > room) {
    body = body.slice(0, room - 10) + '\n…ほか多数';
  }
  return `${header}\n${body}`;
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

  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const auth = admin.auth();
  const stateRef = admin.firestore().collection(STATE_COLLECTION).doc(STATE_DOC);

  const registered = await listRegisteredUsers(auth);
  const snap = await stateRef.get();

  // 初回：ベースライン記録のみ（既存ユーザー分の大量通知を防ぐ）
  if (!snap.exists) {
    await stateRef.set({
      notifiedUids: registered.map((u) => u.uid),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.info(JSON.stringify({ level: 'INFO', msg: 'baseline created', count: registered.length }));
    return;
  }

  const notified = new Set(snap.data().notifiedUids || []);
  const newUsers = registered
    .filter((u) => !notified.has(u.uid))
    .sort((a, b) => new Date(a.metadata.creationTime) - new Date(b.metadata.creationTime));

  if (newUsers.length === 0) {
    console.info(JSON.stringify({ level: 'INFO', msg: 'no new signups' }));
    return;
  }

  await sendDiscord(webhookUrl, buildMessage(newUsers, registered.length));

  // 通知成功後に状態を更新（削除済みユーザーは自然に除外される）
  await stateRef.set({
    notifiedUids: registered.map((u) => u.uid),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.info(JSON.stringify({ level: 'INFO', msg: 'notified', count: newUsers.length }));
}

main().catch((err) => {
  // 詳細はジョブログのみ。シークレットを含みうる値は出力しない
  console.error(JSON.stringify({ level: 'ERROR', msg: err.message }));
  process.exit(1);
});
