#!/bin/sh
# ================================================================
# おうちリズム — ビルドスクリプト
# Cloudflare Pages のビルドコマンドとして実行される
# 環境変数から firebase-config.js を自動生成する
# ================================================================

set -e  # エラーがあれば即停止

echo "[build] firebase-config.js を生成します..."

# 必須の環境変数チェック
if [ -z "$FIREBASE_API_KEY" ] || [ -z "$FIREBASE_PROJECT_ID" ]; then
  echo "[build] WARNING: Firebase環境変数が未設定です。ローカルモードで動作します。"
  cat > firebase-config.js << 'TEMPLATE'
/* 自動生成（環境変数未設定） */
const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
const FIREBASE_CONFIGURED = false;
console.warn('[おうちリズム] Firebase未設定。ローカルモードで動作します。');
TEMPLATE
else
  # 環境変数から firebase-config.js を生成
  cat > firebase-config.js << TEMPLATE
/* 自動生成 — コミットしないこと */
const FIREBASE_CONFIG = {
  apiKey:            "${FIREBASE_API_KEY}",
  authDomain:        "${FIREBASE_AUTH_DOMAIN}",
  projectId:         "${FIREBASE_PROJECT_ID}",
  storageBucket:     "${FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: "${FIREBASE_MESSAGING_SENDER_ID}",
  appId:             "${FIREBASE_APP_ID}",
};
const FIREBASE_CONFIGURED =
  FIREBASE_CONFIG.apiKey !== "YOUR_API_KEY" &&
  FIREBASE_CONFIG.projectId !== "YOUR_PROJECT_ID";
if (!FIREBASE_CONFIGURED) {
  console.warn('[おうちリズム] firebase-config.js が未設定です。ローカルモードで動作します。');
}
TEMPLATE
  echo "[build] firebase-config.js を生成しました (project: ${FIREBASE_PROJECT_ID})"
fi

echo "[build] 完了"
