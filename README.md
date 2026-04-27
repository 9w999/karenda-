# LINE Webhook Relay（Render → GAS 中継サーバー）

LINEからのWebhookを受け取り、Google Apps Script（GAS）に転送するだけのシンプルなサーバーです。

---

## 構成

```
LINE Bot
  ↓ POST /webhook
Render（このサーバー）
  ↓ POST（転送）
Google Apps Script（doPost で処理）
```

---

## セットアップ手順

### 1. GAS側の準備

GASの `doPost` 関数はそのまま使えます。  
ただし、**GASをWebアプリとして公開**する必要があります。

GAS エディタで：
1. 「デプロイ」→「新しいデプロイ」
2. 種類：**ウェブアプリ**
3. 実行ユーザー：**自分**
4. アクセスできるユーザー：**全員**
5. デプロイ → 発行されたURLをコピー

### 2. Renderにデプロイ

1. このリポジトリをGitHubにプッシュ
2. [Render](https://render.com) でアカウント作成
3. 「New Web Service」→ GitHubリポジトリを選択
4. 設定：
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. 「Environment Variables」に以下を追加：

| Key | Value |
|-----|-------|
| `GAS_URL` | GASのWebアプリURL（手順1で取得） |

6. 「Create Web Service」でデプロイ完了

### 3. LINE Developersの設定

1. [LINE Developers Console](https://developers.line.biz/) を開く
2. Botのチャンネル設定 → Messaging API
3. **Webhook URL** を以下に変更：

```
https://（RenderのURL）/webhook
```

例：`https://line-relay-xxxx.onrender.com/webhook`

4. 「Webhookの利用」をONにする
5. 「検証」ボタンで200が返れば成功

---

## 注意事項

- Renderの無料プランはしばらくアクセスがないとサーバーがスリープします。  
  最初のWebhookが届いた際に起動に数秒かかる場合があります。  
  有料プランにするか、[UptimeRobot](https://uptimerobot.com/) 等で定期的にヘルスチェックを送ると改善します。

- GAS側のコード（`doPost`等）は**変更不要**です。  
  ただし、GASのWebアプリとして公開済みであることが必須です。
