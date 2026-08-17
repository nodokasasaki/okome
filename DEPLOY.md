
# おうちリズム — 環境一覧

| 環境 | URL | 更新タイミング |
|------|-----|---------------|
| **開発環境**（Cloudflare プレビュー） | https://okomedev.pages.dev/ | `git push origin dev` のたびに自動更新 |
| **本番環境**（Cloudflare Pages） | https://okome.pages.dev | `git push origin main` のたびに自動更新 |
| **本番環境**（GitHub Pages） | https://nodokasasaki.github.io/okome/ | `git push origin main` のたびに自動更新 |
| **ローカル開発** | http://localhost:8080 | `python3 -m http.server 8080` で手動起動 |

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

### Step 2 — firebase-config.js を編集

プロジェクト内の `firebase-config.js` を開き、コピーした値を貼り付け：

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

### Step 3 — Firebase Authentication を有効化

Firebase コンソール → 「Authentication」→「始める」→ 以下を有効にする：

| プロバイダー | 設定箇所 | 備考 |
|---|---|---|
| **Google** | ネイティブプロバイダー | 「有効にする」をONにして保存 |
| **メール/パスワード** | ネイティブプロバイダー | 「有効にする」のみON（メールリンクは不要） |
| **匿名** | ネイティブプロバイダー | 「有効にする」をONにして保存 |

### Step 4 — Firestore Database を作成

Firebase コンソール → 「Firestore Database」→「データベースの作成」
- モード: **本番環境モード**
- リージョン: `asia-northeast1`（東京）

### Step 5 — Firestore セキュリティルールを設定

Firebase コンソール → Firestore → 「ルール」タブ → 以下に書き換えて「公開」：

> ⚠️ **セキュリティ上の注意：以下のルールを必ず使用してください。旧バージョンのルール（`partnerUid == null` を含むもの）には脆弱性があります。**

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
      // 作成：ログイン済み（匿名ユーザー不可）
      allow create: if request.auth != null
        && !request.auth.token.firebase.sign_in_provider.matches('anonymous');

      // 読み取り・更新：自分がオーナーまたはパートナーのみ
      // ※ partnerUid == null 条件は削除済み（未接続ルームの不正読み取り脆弱性の修正）
      allow read, update: if request.auth != null && (
        resource.data.ownerUid == request.auth.uid ||
        resource.data.partnerUid == request.auth.uid
      );

      // 削除：オーナーまたはパートナーのみ
      allow delete: if request.auth != null && (
        resource.data.ownerUid == request.auth.uid ||
        resource.data.partnerUid == request.auth.uid
      );

      // サブコレクション（comments / notifications）：ルームメンバーのみ
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

| デプロイ先 | 追加するドメイン |
|---|---|
| GitHub Pages | `nodokasasaki.github.io` |
| Cloudflare Pages | `okome.pages.dev` |
| カスタムドメイン | 独自ドメイン |
| ローカル開発 | `localhost`（デフォルトで追加済み） |

### 確認

設定完了後、ローカルサーバー（`python3 -m http.server 8080`）で起動し、
「設定」画面の「アカウント・同期」エリアに「ログイン」ボタンが表示されれば完了。

---


# おうちリズム — 環境・デプロイガイド

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
| `main`   | 本番環境（公開用） |
| `dev`    | 開発・作業用（ここで機能追加・修正を行う） |

---

## 環境 URL

### 本番環境（GitHub Pages）

```
https://nodokasasaki.github.io/okome/
```

> GitHub Pages を有効にしていない場合は以下の手順で設定：
> GitHub リポジトリ → Settings → Pages → Branch: `main` / `/(root)` → Save

---

### 本番環境（Cloudflare Pages）

```
https://okome.pages.dev
```

> ※ Cloudflare Pages のプロジェクト作成後、ダッシュボードで確認できる実際の URL に書き換えてください。
> カスタムドメインを設定した場合はそちらの URL を使います。

---

### 開発環境（ローカルサーバー）

```
http://localhost:8080
```

起動コマンド（プロジェクトフォルダで実行）:

```bash
python3 -m http.server 8080
```

iPhone から確認する場合は Mac の IP アドレスを使う:

```
http://[MacのIPアドレス]:8080
```

IP アドレス確認:
```bash
ipconfig getifaddr en0
```

---

## 環境への反映コマンド

### 開発ブランチで作業 → リモートに保存

```bash
# 1. 変更をステージング
git add .

# 2. コミット（メッセージは内容に合わせて変更）
git commit -m "feat: ○○を追加"

# 3. dev ブランチにプッシュ（開発環境へ反映）
git push origin dev
```

---

### 開発内容を本番（main）へ反映

```bash
# 1. main ブランチに切り替え
git checkout main

# 2. dev の変更を取り込む
git merge dev

# 3. 本番（GitHub Pages & Cloudflare Pages）へプッシュ
git push origin main

# 4. 作業用 dev ブランチに戻る
git checkout dev
```

> `git push origin main` 後、GitHub Pages は約1〜2分、Cloudflare Pages は約30秒〜1分で反映されます。

---

### Cloudflare Pages への反映

> ⚠️ **注意：`main` への push は本番環境に直接反映されます。**
> `dev` ブランチで確認が取れてから `main` にマージするのが安全な運用です。

---

#### ブランチと環境の対応

| 操作 | Cloudflare プレビュー | 本番（CF & GH Pages） |
|------|:---------------------:|:--------------------:|
| `git push origin dev` | ✅ 反映（プレビューURL） | ❌ 変わらない |
| `git push origin main` | — | ✅ 反映 |

- `dev` を push すると Cloudflare が自動でプレビュー URL を発行します
  ```
  https://dev.okome.pages.dev   ← dev push のたびに更新
  https://okome.pages.dev       ← main push 時だけ更新（本番）
  ```
- **本番を変えずに動作確認したい場合は `git push origin dev` だけ使う**

---

#### 方法 A：Git 連携（推奨 / push するだけで自動デプロイ）

Cloudflare Pages と GitHub リポジトリを連携しておくと、
`main` ブランチに push するだけで本番に自動デプロイされます。

```bash
# dev で確認 → 問題なければ本番へリリース
git checkout main && git merge dev && git push origin main && git checkout dev
```

**初回設定（一度だけ）:**
1. https://dash.cloudflare.com → Workers & Pages → Create application → Pages
2. 「Connect to Git」→ GitHub の `nodokasasaki/okome` を選択
3. 以下を設定：
   - Branch: `main`
   - **Build command: `sh build.sh`**
   - Build output directory: `/`（ルート）
4. 「Environment variables」セクションで以下を追加（本番・プレビュー両方に設定）：

| 変数名 | 値 |
|--------|-----|
| `FIREBASE_API_KEY` | Firebase の apiKey |
| `FIREBASE_AUTH_DOMAIN` | Firebase の authDomain |
| `FIREBASE_PROJECT_ID` | Firebase の projectId |
| `FIREBASE_STORAGE_BUCKET` | Firebase の storageBucket |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase の messagingSenderId |
| `FIREBASE_APP_ID` | Firebase の appId |

5. 「Save and Deploy」

> 設定後は `git push origin main` するだけで、ビルド時に `build.sh` が自動実行され
> `firebase-config.js` が生成されます。APIキーはCloudflareのサーバー内にのみ存在し、
> GitHubには一切記録されません。

---

#### 方法 B：Wrangler CLI で直接アップロード（Git を使わず即時反映したい場合）

```bash
# 1. Wrangler をインストール（初回のみ）
npm install -g wrangler

# 2. Cloudflare アカウントにログイン（初回のみ・ブラウザが開く）
wrangler login

# 3. 本番にアップロード
wrangler pages deploy . --project-name=okome

# 4. プレビュー（dev 相当）にだけ上げたい場合
wrangler pages deploy . --project-name=okome --branch=dev

# ※ --project-name は Cloudflare ダッシュボードのプロジェクト名に合わせる
```

> Wrangler のインストールには Node.js が必要です。
> `node -v` でバージョンを確認してください（v18 以上推奨）。

---

### 現在のブランチ確認・状態確認

```bash
git branch
git status
git log --oneline -10
```

---

## よく使うコマンド一覧

| 目的 | コマンド |
|------|---------|
| ローカルサーバー起動 | `python3 -m http.server 8080` |
| 変更を全てステージング | `git add .` |
| コミット | `git commit -m "メッセージ"` |
| dev にプッシュ | `git push origin dev` |
| dev を Cloudflare プレビューに反映 | `git push origin dev` |
| main にマージして本番公開（CF & GH Pages） | `git checkout main && git merge dev && git push origin main && git checkout dev` |
| Wrangler で本番に直接アップロード | `wrangler pages deploy . --project-name=okome` |
| Wrangler でプレビューにだけ上げる | `wrangler pages deploy . --project-name=okome --branch=dev` |
| ブランチ確認 | `git branch` |
| ログ確認 | `git log --oneline -10` |
| 変更を取り消し（未コミット） | `git restore .` |
| リモートから最新を取得 | `git pull origin dev` |
