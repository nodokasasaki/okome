# おうちリズム — 拡散・利用者増加施策計画

> **対象アプリ：** おうちリズム（家事スケジュール管理ウェブアプリ）
> **ターゲットユーザー：** 家事の予定表を作りたい人・家事スケジュールを管理したい人
> **基本方針：** AIで自動化できる設計を優先する

---

## 現状整理

| 項目 | 現状 |
|------|------|
| アプリ形態 | ブラウザウェブアプリ（PWAではない） |
| 正式URL | https://kakusan-25200.web.app/ |
| GitHub Pages URL | https://nodokasasaki.github.io/okome/ |
| Cloudflare Pages | 開発者専用プレビュー環境（エンドユーザー向けではない） |
| LPページ | **未作成**（現在 index.html がアプリ本体のみ） |
| SNSアカウント | **未作成** |
| OGP設定 | 未対応 |

---

## 施策一覧・優先度

| # | 施策 | 優先度 | AI自動化度 | ステータス |
|---|------|--------|------------|------------|
| ① | ランディングページ（LP）構築 | 🔴 最高 | 手動（一度だけ作成） | ⬜ 未着手 |
| ② | OGP・SNSシェア設定 | 🔴 最高 | 手動（一度だけ設定） | ⬜ 未着手 |
| ③ | SNSアカウント開設・AI自動投稿 | 🔴 最高 | ★★★ 全自動 | ⬜ 未着手 |
| ④ | SEO対策（sitemap.xml / robots.txt） | 🟡 中 | ★★ 半自動 | ⬜ 未着手 |
| ⑤ | プレスリリース（PR Times など） | 🟡 中 | 手動 | ⬜ 未着手 |
| ⑥ | リファラル機能（友達招待） | 🟢 低 | ★★ 半自動 | ⬜ 未着手 |

---

## ① ランディングページ（LP）構築

### 目的
初めて訪れたユーザーがアプリの価値を理解し、使ってみたくなるページを作る。
現在 `index.html` はアプリ本体のみで、説明が一切ない状態。

### 作成ファイル
```
lp/
└── index.html   ← LP本体（独立ページ）
```

### LP構成案（1ページスクロール型）

| セクション | 内容 |
|-----------|------|
| ヒーロー | キャッチコピー＋アプリの見た目スクリーンショット＋「今すぐ使う」ボタン |
| 課題提起 | 「こんなことで困ってませんか？」（家事を忘れる・溜まる・夫婦でズレる） |
| 解決策 | おうちリズムでできること（カレンダー管理・ジャンル別・パートナー共有） |
| 使い方 | 3ステップで簡単説明 |
| CTA | 「無料で使ってみる」ボタン → アプリ本体 URL |

### 技術仕様
- 純粋なHTML/CSS（JS最小限）
- OGPメタタグ完備（→ ②と連動）
- `lp/index.html` を Firebase Hosting に配置
- アプリ本体 URL はそのまま維持

### 着手タスク
- [x] `lp/index.html` を作成
- [x] Firebase Hosting の `firebase.json` に `lp/` ルートを追加
- [ ] OGP画像（`og-image.png`）を用意（1200×630px）

---

## ② OGP・SNSシェア設定

### 目的
SNS・LINEでシェアされたときに、タイトル・説明・サムネが正しく表示されるようにする。

### 設定内容（LP の `<head>` に追加）

```html
<!-- OGP基本 -->
<meta property="og:title" content="おうちリズム — 家事の予定表をかんたん管理">
<meta property="og:description" content="掃除・洗濯・料理など家事のスケジュールをカレンダーで一元管理。パートナーとの共有もできる無料ウェブアプリ。">
<meta property="og:image" content="https://kakusan-25200.web.app/lp/og-image.png">
<meta property="og:url" content="https://kakusan-25200.web.app/lp/">
<meta property="og:type" content="website">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="おうちリズム — 家事の予定表をかんたん管理">
<meta name="twitter:description" content="掃除・洗濯・料理など家事のスケジュールをカレンダーで一元管理。無料ウェブアプリ。">
<meta name="twitter:image" content="https://kakusan-25200.web.app/lp/og-image.png">
```

### 着手タスク
- [ ] OGP画像作成（Canva等で1200×630px）
- [ ] LP `<head>` にOGPタグ追加
- [ ] Twitter Card Validator・Facebook Debugger で確認

---

## ③ SNSアカウント開設・AI自動投稿

### 推奨プラットフォーム

| プラットフォーム | 優先度 | 理由 |
|----------------|--------|------|
| X（旧Twitter） | 🔴 第1優先 | 家事・主婦・暮らし系の情報拡散力が高い。ハッシュタグ文化あり |
| Instagram | 🟡 第2優先 | 暮らし・インテリア・家事アカウントのフォロワー数が多い |

### AI自動投稿アーキテクチャ

```
GitHub Actions（スケジュール実行: 週3回）
  ↓
OpenAI API（GPT-4o）
  ↓ 曜日・季節・テーマを渡してツイート文を生成
X API v2 / Instagram Graph API
  ↓ 自動投稿
Firestore（投稿ログ保存）
```

### 投稿パターン

| 投稿タイプ | 頻度 | 内容例 |
|-----------|------|--------|
| 掃除Tipsツイート | 週2回（月・木） | 「排水口のぬめりは重曹＋クエン酸で簡単解決！おうちリズムに月1タスクとして登録しておくと便利です🧹 #家事 #掃除 #暮らし」 |
| 季節ネタ | 月2回 | 「梅雨前に浴室のゴムパッキン確認を！おうちリズムで「梅雨前カビ対策」を年1タスクに登録してみて☂️」 |
| 機能紹介 | 週1回（土） | 「パートナーと家事を共有する機能があります。おうちリズムの「共有ルーム」機能で夫婦・同棲カップルの家事分担をスムーズに✨」 |

### GitHub Actions ワークフロー設計

```yaml
# .github/workflows/sns-auto-post.yml
name: SNS Auto Post
on:
  schedule:
    - cron: '0 9 * * 1'  # 月曜 9:00 JST
    - cron: '0 9 * * 4'  # 木曜 9:00 JST
    - cron: '0 10 * * 6' # 土曜 10:00 JST
jobs:
  post:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate and post tweet
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          X_API_KEY: ${{ secrets.X_API_KEY }}
          X_API_SECRET: ${{ secrets.X_API_SECRET }}
          X_ACCESS_TOKEN: ${{ secrets.X_ACCESS_TOKEN }}
          X_ACCESS_SECRET: ${{ secrets.X_ACCESS_SECRET }}
        run: node .github/scripts/auto-post.js
```

### 必要なシークレット（GitHub Repository Secrets に登録）

| シークレット名 | 内容 |
|--------------|------|
| `OPENAI_API_KEY` | OpenAI API キー |
| `X_API_KEY` | X（Twitter）API キー |
| `X_API_SECRET` | X API シークレット |
| `X_ACCESS_TOKEN` | X アクセストークン |
| `X_ACCESS_SECRET` | X アクセスシークレット |

### 着手タスク
- [ ] X（Twitter）アカウント開設（アカウント名案：`@ouchirhythm`）
- [ ] X Developer Portal でアプリ登録・API キー取得
- [ ] OpenAI API キー取得
- [ ] `.github/scripts/auto-post.js` を作成
- [ ] `.github/workflows/sns-auto-post.yml` を作成
- [ ] GitHub Repository Secrets に各キーを登録
- [ ] 動作確認（手動トリガーで1回テスト投稿）

---

## ④ SEO対策

### 目的
「家事 スケジュール アプリ」「掃除 予定表」などで検索されたときに表示されるようにする。

### 作成ファイル
```
sitemap.xml    ← Google Search Console 用
robots.txt     ← クローラー許可設定
```

### robots.txt
```
User-agent: *
Allow: /
Disallow: /node_modules/
Sitemap: https://kakusan-25200.web.app/sitemap.xml
```

### sitemap.xml（主要ページ）
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://kakusan-25200.web.app/lp/</loc>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://kakusan-25200.web.app/</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

### 着手タスク
- [ ] `robots.txt` を作成
- [ ] `sitemap.xml` を作成
- [ ] Google Search Console にサイト登録・sitemap送信

---

## ⑤ プレスリリース

### 候補媒体
- **PR Times**（無料プランあり）
- **はてなブログ**（SEO効果・暮らし系読者多い）
- **note**（暮らし・家事カテゴリあり）

### 見出し案
「家事の予定表がかんたんに作れるウェブアプリ「おうちリズム」を公開しました」

### 着手タスク
- [ ] LP完成後に記事を執筆
- [ ] PR Times または note に投稿

---

## ⑥ リファラル機能（友達招待）

### 概要
既存ユーザーが友達を招待すると、お互いに特典（称号・バッジなど）が付与される仕組み。

### 実装方針
- 招待URLを生成（`?ref=USER_ID` パラメータ）
- Firestore にリファラルログを保存
- 招待した人・された人に称号を付与

### 着手タスク
- [ ] 招待URL生成ロジックを実装
- [ ] Firestore `referrals` コレクション設計
- [ ] 称号付与ロジックを既存バッジ機能と統合

---

## 施策ロードマップ

```
Week 1-2:   ① LPページ構築
Week 2:     ② OGP設定（LP完成と同時）
Week 3:     ③ SNSアカウント開設 + AI自動投稿セットアップ
Week 3-4:   ④ SEO（robots.txt / sitemap.xml / Search Console登録）
Month 2:    ⑤ プレスリリース・note記事投稿
Month 3:    ⑥ リファラル機能実装
```

---

## 参照リンク

- アプリ本体：https://kakusan-25200.web.app/
- GitHub リポジトリ：https://github.com/nodokasasaki/okome
- 環境・デプロイガイド：[DEPLOY.md](./DEPLOY.md)
