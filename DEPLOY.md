
# おうちリズム — 環境一覧

| 環境 | URL | 更新タイミング |
|------|-----|---------------|
| **本番環境**（Cloudflare Pages） | https://okomedev.pages.dev | `git push origin main` のたびに自動更新 |
| **ローカル開発** | http://localhost:8080 | `python3 -m http.server 8080` で手動起動 |

> ※ 現在 Cloudflare プロジェクトは `okomedev` の1つのみ。
> ブランチは `main`（本番）/ `dev`（作業用）で運用しているが、公開URLは `okomedev.pages.dev` の1本。
> 別途 `okome` プロジェクトを作成すれば本番/開発を別URLに分離できる。

---

## リポジトリ

| 項目 | 値 |
|------|----|
| GitHub リポジトリ | https://github.com/nodokasasaki/okome |
| ローカルパス | /Users/nodokasasaki/Downloads/okome |

---

## ブランチ運用

| ブランチ | 用途 |
|----------|------|
| `main`   | 本番（`okomedev.pages.dev` に公開される） |
| `dev`    | 作業用（ローカルで確認してからmainにマージ） |

```
main  ← 本番公開（okomedev.pages.dev）
  └─ dev ← 作業ブランチ★
```

---

## デプロイコマンド

### 開発環境へ反映（dev プッシュ）

```bash
git add .
git commit -m "feat: ○○を追加"
git push origin dev
```

### 本番環境へ反映（main へマージ）

```bash
git checkout main && git merge dev && git push origin main && git checkout dev
```

> `git push origin main` 後、Cloudflare Pages は約30秒〜1分で反映されます。

---

## よく使うコマンド一覧

| 目的 | コマンド |
|------|---------|
| ローカルサーバー起動 | `python3 -m http.server 8080` |
| 変更を全てステージング | `git add .` |
| コミット | `git commit -m "メッセージ"` |
| dev にプッシュ（開発環境へ） | `git push origin dev` |
| main にマージして本番公開 | `git checkout main && git merge dev && git push origin main && git checkout dev` |
| ブランチ確認 | `git branch` |
| ログ確認 | `git log --oneline -10` |
| 変更を取り消し（未コミット） | `git restore .` |
| リモートから最新を取得 | `git pull origin dev` |

---

## Firebase セットアップ（クラウド同期・アカウント機能）

### 必要なもの
- Googleアカウント（無料）

### Step 1 — Firebase プロジェクト作成（5分）

1. https://console.firebase.google.com にアクセス
2. 「プロジェクトを追加」→ 名前: `kakusan`（任意）→ Googleアナリティクスは不要でOK
3. 作成完了後、**「プロジェクトの設定」（歯車アイコン）→「全般」タブ**
4. 「マイアプリ」→「ウェブ」アイコン `</>` をクリック
5. アプリニックネームを入力 → 「アプリを登録」
6. 表示された `firebaseConfig` の内容をコピー

### Step 2 — ローカル開発用に firebase-config.js を編集

プロジェクト内の `firebase-config.js`（`.gitignore` 対象・コミット不可）を開き、コピーした値を貼り付け：

```js
const FIREBASE_CONFIG = {
  apiKey:            "実際のapiKey",
  authDomain:        "実際のauthDomain",
  projectId:         "実際のprojectId",
  storageBucket:     "実際のstorageBucket",
  messagingSenderId: "実際のmessagingSenderId",
  appId:             "実際のappId",
};
```

> Cloudflare Pages では環境変数から `build.sh` が自動生成するため、この手順はローカル開発専用。

### Step 3 — Firebase Authentication を有効化

Firebase コンソール → 「Authentication」→「始める」→ 以下を有効にする：

| プロバイダー | 備考 |
|---|---|
| **Google** | 「有効にする」をONにして保存 |
| **メール/パスワード** | 「有効にする」のみON |
| **匿名** | 「有効にする」をONにして保存 |

### Step 4 — Firestore Database を作成

Firebase コンソール → 「Firestore Database」→「データベースの作成」
- モード: **本番環境モード**
- リージョン: `asia-northeast1`（東京）

### Step 5 — Firestore セキュリティルールを設定

Firebase コンソール → Firestore → 「ルール」タブ → 以下に書き換えて「公開」：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ユーザーは自分のデータのみ読み書き可能
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // パートナー共有ルーム
    match /share_rooms/{roomId} {
      allow create: if request.auth != null;
      allow read, update: if request.auth != null && (
        resource.data.ownerUid == request.auth.uid ||
        resource.data.partnerUid == request.auth.uid ||
        resource.data.partnerUid == null
      );
      allow delete: if request.auth != null && (
        resource.data.ownerUid == request.auth.uid ||
        resource.data.partnerUid == request.auth.uid
      );
      match /{sub}/{docId} {
        allow read, write: if request.auth != null && (
          get(/databases/$(database)/documents/share_rooms/$(roomId)).data.ownerUid == request.auth.uid ||
          get(/databases/$(database)/documents/share_rooms/$(roomId)).data.partnerUid == request.auth.uid
        );
      }
    }

  }
}
```

### Step 6 — Authorized Domains を追加（Googleログイン用）

Firebase コンソール → Authentication → 「設定」タブ → 「承認済みドメイン」：

| 追加するドメイン | 用途 |
|---|---|
| `okome.pages.dev` | Cloudflare Pages 本番 |
| `okomedev.pages.dev` | Cloudflare Pages 開発 |
| `localhost` | ローカル開発（デフォルトで追加済み） |

---

## Cloudflare Pages 設定

### 環境変数（Variables and Secrets）

Cloudflare ダッシュボード → `okome` → Settings → Variables and Secrets → 「Import .env」でローカルの `.env` を貼り付け：

| 変数名 | 値 |
|--------|-----|
| `FIREBASE_API_KEY` | Firebase の apiKey |
| `FIREBASE_AUTH_DOMAIN` | Firebase の authDomain |
| `FIREBASE_PROJECT_ID` | Firebase の projectId |
| `FIREBASE_STORAGE_BUCKET` | Firebase の storageBucket |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase の messagingSenderId |
| `FIREBASE_APP_ID` | Firebase の appId |

### ビルド設定

| 項目 | 値 |
|------|----|
| Build command | `sh build.sh` |
| Build output directory | `/`（ルート） |
| Branch（本番） | `main` |
| Branch（開発プレビュー） | `dev` |

> `build.sh` がビルド時に環境変数から `firebase-config.js` を自動生成します。  
> APIキーは Cloudflare のサーバー内にのみ存在し、GitHub には一切記録されません。
