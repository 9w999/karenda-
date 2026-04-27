'use strict';

const express = require('express');
const axios   = require('axios');
const { google } = require('googleapis');
const { Readable } = require('stream');
const cron = require('node-cron');

const { debugLog }           = require('./src/logger');
const { replyToUser, notifyHelp } = require('./src/line');
const { geminiRes }          = require('./src/gemini');
const { checkNotification }  = require('./src/remind');

const app = express();
app.use(express.json());

const PORT                    = process.env.PORT || 3000;
const CHANNEL_ACCESS_TOKEN    = process.env.CHANNEL_ACCESS_TOKEN;
const GOOGLE_DRIVE_FOLDER_ID  = process.env.GOOGLE_DRIVE_FOLDER_ID;

// ── ヘルスチェック ──────────────────────────────────────────────────
app.get('/', (req, res) => res.send('LINE Bot Server is running.'));

// ── LINE Webhook ────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  debugLog(0);
  console.log('[webhook] received:', JSON.stringify(req.body));

  // LINEには即200を返す（タイムアウト防止）
  res.status(200).send('OK');

  const events = req.body.events || [];

  for (const event of events) {
    const userId = event.source?.userId;
    debugLog(1, new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
    debugLog(2, userId);

    if (event.type !== 'message') continue;

    if (event.message.type === 'image') {
      await handleImageMessage(event, userId);
    } else if (event.message.type === 'text') {
      await handleTextMessage(event, userId);
    }
  }
});

// ── 画像メッセージ処理 ──────────────────────────────────────────────
async function handleImageMessage(event, userId) {
  debugLog(4, 'ProcessImageMessage');
  let chatReplyText = '0';
  let fileId;

  // ① LINE から画像をダウンロード
  const imageUrl = `https://api-data.line.me/v2/bot/message/${event.message.id}/content`;
  let imageBuffer;
  try {
    const res = await axios.get(imageUrl, {
      headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` },
      responseType: 'arraybuffer',
    });
    imageBuffer = Buffer.from(res.data);
    debugLog(11, '画像ダウンロード完了');
  } catch (e) {
    console.error('[画像取得エラー]', e.message);
    chatReplyText = 'エラーが発生しました:E100';
  }

  // ② Google Drive にアップロード
  if (chatReplyText === '0' && imageBuffer) {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
      const drive   = google.drive({ version: 'v3', auth });
      const imgName = `${Date.now()}.png`;
      debugLog(17, imgName);

      const uploaded = await drive.files.create({
        requestBody: { name: imgName, parents: [GOOGLE_DRIVE_FOLDER_ID] },
        media: { mimeType: 'image/png', body: Readable.from(imageBuffer) },
      });
      fileId = uploaded.data.id;
      debugLog(4, 'DriveConnectionProcessCompleted');
    } catch (e) {
      debugLog(8, 'GoogleDriveエラー');
      debugLog(25, e.toString());
      chatReplyText = 'エラーが発生しました:E100';
    }
  }

  // ③ Gemini 解析 → カレンダー登録 → 保護者通知
  if (chatReplyText === '0' && fileId) {
    try {
      chatReplyText = await geminiRes(fileId, userId);
    } catch (e) {
      debugLog(8, 'GeminiImgエラー');
      chatReplyText = getGeminiErrorText(e);
    }
  }

  // ④ LINE へ返信
  try {
    await replyToUser(event.replyToken, chatReplyText);
    debugLog(7, 'ReplyCompleted');
  } catch (e) {
    console.error('[返信エラー]', e.message);
  }
}

// ── テキストメッセージ処理 ─────────────────────────────────────────
async function handleTextMessage(event, userId) {
  const input = event.message.text;

  if (input.includes('ヘルプ')) {
    await notifyHelp(input);
    await replyToUser(event.replyToken, '担当者にメッセージを送りました\n確認までしばらくお待ちください');

  } else if (input.includes('LINE ID確認メッセージ')) {
    debugLog(4, 'LINE ID確認メッセージ');
    await replyToUser(event.replyToken, `あなたのUser_IDは${userId}\nです。`);

  } else if (input.includes('まえのしゃしんだして')) {
    // おまけ機能（未実装のため案内のみ）
    await replyToUser(event.replyToken, 'この機能は現在準備中です。');
  }
}

// ── Geminiエラー判定 ───────────────────────────────────────────────
function getGeminiErrorText(e) {
  const status = e.response?.status;
  if (status === 429) {
    debugLog(25, 'エラー429');
    return 'エラーが発生しました:E211\nGeminiへのリクエストが多くなりすぎています。時間をおいて再度実行してください';
  }
  if (status === 503) {
    debugLog(25, 'Geminiサーバー混雑');
    return 'エラーが発生しました:E212\nGeminiのサーバーが混雑しています。時間をおいて再度実行してください';
  }
  if (e.name === 'TypeError') {
    debugLog(25, 'E220: ' + e.message);
    return 'エラーが発生しました:E220';
  }
  debugLog(25, 'E299: ' + e.name + ' / ' + e.message);
  return 'エラーが発生しました:E299';
}

// ── 予定リマインド cron（毎時0分・30分に実行） ──────────────────────
cron.schedule('0,30 * * * *', async () => {
  console.log('[cron] CheckNotification 実行');
  try {
    await checkNotification();
  } catch (e) {
    console.error('[cron] エラー:', e.message);
  }
}, { timezone: 'Asia/Tokyo' });

// ── サーバー起動 ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
