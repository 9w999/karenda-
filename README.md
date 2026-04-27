# LINE Bot Server（GASなし・フル移植版）

GASを使わず、Node.jsサーバーだけで動作するLINE Botです。

---

## ディレクトリ構成

```
.
├── index.js          # メインサーバー（Webhookエンドポイント・cronリマインド）
├── package.json
├── users.json        # ユーザーデータ（スプレッドシート代替）
├── events.json       # カレンダーイベント保存（リマインド用）
└── src/
    ├── logger.js     # ログ出力（GAS debugLog の代替）
    ├── users.js      # ユーザーデータ取得
    ├── line.js       # LINE API 送信関数
    ├── gemini.js     # Gemini API 画像解析
    ├── calendar.js   # Google Calendar API 操作
    └── remind.js     # 予定リマインド（CheckNotification の代替）
```

---

## GASからの変更点

| GAS機能 | Node.js代替 |
|---|---|
| スプレッドシート（ユーザーデータ） | `users.json` |
| スプレッドシート（イベントデータ） | `events.json` |
| `debugLog` | `console.log` |
| GASのトリガー（定期実行） | `node-cron`（毎時0分・30分） |
| `UrlFetchApp` | `axios` |
| `CalendarApp` | Google Calendar API（サービスアカウント） |
| `DriveApp` | Google Drive API（サービスアカウント） |

---

## 環境変数（Renderに設定）

| Key | 説明 |
|---|---|
| `CHANNEL_ACCESS_TOKEN` | LINEチャンネルアクセストークン |
| `GEMINI_API_KEY` | Gemini APIキー |
| `GOOGLE_DRIVE_FOLDER_ID` | 画像保存先のGoogle Drive フォルダID |
| `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` | サービスアカウントJSONのパス（後述） |
| `ADMIN_USER_ID` | ヘルプ通知の送り先LINE UserID |

---

## サービスアカウントの設定

Google Drive / Google Calendar を使うためにサービスアカウントが必要です。

1. Google Cloud Console でサービスアカウントを作成
2. 「Drive API」「Calendar API」を有効化
3. サービスアカウントに以下の権限を付与：
   - 対象のDriveフォルダ → 編集者
   - 対象のGoogleカレンダー → 「予定の変更および共有の管理」
4. サービスアカウントのキー（JSON）をダウンロード
5. Renderの場合：キーファイルをリポジトリに含めず、**Secret Files** 機能で `/etc/secrets/service-account.json` に配置
6. 環境変数 `GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/etc/secrets/service-account.json` を設定

---

## users.json の設定

スプレッドシートの「idsearch」シートに相当します。  
生徒が増えたら以下の形式で追加してください。

```json
[
  {
    "studentLineId": "U生徒のLINE ID",
    "studentCalendarId": "生徒のGmailアドレス（カレンダーID）",
    "parentCalendarId": "保護者のGmailアドレス（カレンダーID）",
    "parentLineId": "U保護者のLINE ID"
  }
]
```

---

## Renderへのデプロイ

1. このリポジトリをGitHubにプッシュ
2. Renderで「New Web Service」→ リポジトリを選択
3. 設定：
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. 環境変数をすべて設定
5. LINE DevelopersのWebhook URLを `https://（RenderのURL）/webhook` に設定

---

## 予定リマインドについて

`node-cron` により**毎時0分・30分**に自動実行されます。  
手動で即時実行したい場合：

```bash
node src/remind.js
```
