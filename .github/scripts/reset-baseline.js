/**
 * 一時スクリプト：signupNotifier のベースラインを全ユーザー（匿名含む）で更新する
 * 実行後は削除してください。
 */
'use strict';

const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

async function main() {
  const sa = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
  if (!sa) throw new Error('FIREBASE_ADMIN_SERVICE_ACCOUNT が設定されていません');

  initializeApp({ credential: cert(JSON.parse(sa)) });
  const auth = getAuth();
  const db = getFirestore();

  const uids = [];
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    for (const u of res.users) uids.push(u.uid);
    pageToken = res.pageToken;
  } while (pageToken);

  await db.collection('_system').doc('signupNotifier').set({
    notifiedUids: uids,
    updatedAt: FieldValue.serverTimestamp(),
  });

  console.log(`✅ ベースライン更新完了: ${uids.length} 件を通知済みとして記録しました`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
