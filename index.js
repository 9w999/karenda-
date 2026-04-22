const express = require('express');
const fetch = require('node-fetch');
const app = express();
app.use(express.json());
const GAS_URL = process.env.GAS_URL;
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('LINE Webhook Relay Server is running.');
});

app.post('/webhook', async (req, res) => {
  console.log('[webhook] received:', JSON.stringify(req.body));
  res.status(200).send('OK');

  const events = req.body.events || [0];
  let log = ""; // ← ループの外に出す

  for (const event of events) {
    const userId = event.source.userId;
    log = "log:" + userId;

    if (event.type === 'message') {
      if (event.message.type === 'image') {
        log = log +  "replyText" + "/" + "processImageMessage" + "/" + event + "/" + userId + ")";
      } else if (event.message.type === 'text') {
        const input = event.message.text;
        if (input.match('ヘルプ')) {
          const text3 = "担当者にメッセージを送りました\n確認までしばらくお待ちください";
          log = log + " ヘルプ replyToUser(" + event.replyToken + "," + text3 + ")";
        } else if (input.match('LINE ID確認メッセージ')) {
          const text2 = `あなたのUser_IDは${userId}です。`;
          log = log + " replyToUser(" + event.replyToken + "," + text2 + ")";
        } else if (input.match('まえのしゃしんだして')) {
          log = log + " getPublicUrl()";
        }
      }
    }
    console.log(log);
    if (log.match(processImageMessage)){

      processImageMessage(event,log.split("/")[3])
  }
    const axios = require('axios');
const { google } = require('googleapis');
const { Readable } = require('stream');

const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function processImageMessage(event, userId) {
  console.log("ProcessImageMessage");
  let chatReplyText = "0";

  // ① LINE から画像をダウンロード
  const imageUrl = `https://api-data.line.me/v2/bot/message/${event.message.id}/content`;
  let imageBuffer;
  try {
    const res = await axios.get(imageUrl, {
      headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` },
      responseType: 'arraybuffer',
    });
    imageBuffer = Buffer.from(res.data);
    console.log("画像ダウンロード完了");
  } catch (e) {
    console.log("画像取得エラー:", e.message);
    chatReplyText = "エラーが発生しました:E100";
  }

  // ② Google Drive にアップロード
  let fileId;
  if (chatReplyText === "0" && imageBuffer) {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH, // サービスアカウントのJSONパス
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
      const drive = google.drive({ version: 'v3', auth });
      const imgName = `${Date.now()}.png`;
      const stream = Readable.from(imageBuffer);

      const uploaded = await drive.files.create({
        requestBody: {
          name: imgName,
          parents: [GOOGLE_DRIVE_FOLDER_ID],
        },
        media: {
          mimeType: 'image/png',
          body: stream,
        },
      });
      fileId = uploaded.data.id;
      console.log("Driveアップロード完了:", fileId);
    } catch (e) {
      console.log("GoogleDriveエラー:", e.message);
      chatReplyText = "エラーが発生しました:E100";
    }
  }

  // ③ Gemini API で画像解析
  if (chatReplyText === "0" && fileId) {
    try {
      chatReplyText = await GeminiRes(fileId, userId);
    } catch (e) {
      console.log("Geminiエラー:", e.message);
      if (e.response?.status === 429) {
        chatReplyText = "エラーが発生しました:E211\n時間をおいて再度実行してください";
      } else if (e.response?.status === 503) {
        chatReplyText = "エラーが発生しました:E212\nGeminiのサーバーが混雑しています";
      } else {
        chatReplyText = "エラーが発生しました:E299";
      }
    }
  }

  // ④ LINE に返信
  await replyToUser(event.replyToken, chatReplyText);
  console.log("ReplyCompleted");
}

// LINE返信
async function replyToUser(replyToken, text) {
  await axios.post('https://api.line.me/v2/bot/message/reply', {
    replyToken,
    messages: [{ type: 'text', text }],
  }, {
    headers: {
      'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
}

// Gemini API呼び出し（画像IDを使う場合は要調整）
async function GeminiRes(fileId, userId) {
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key=${GEMINI_API_KEY}`,
    {
      contents: [{
        parts: [
          { text: `ユーザー${userId}の画像を解析してください` },
          // fileIdからDriveの画像URLを直接渡す場合はここを調整
        ]
      }]
    }
  );
  return res.data.candidates[0].content.parts[0].text;
}

  if (!GAS_URL) {
    console.error('[webhook] GAS_URL が設定されていません');
    return;
  }
  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...req.body,
        renderLog: log  // ← GASにlogを追加して送信
      }),
      redirect: 'follow',
    });
    const text = await response.text();
    console.log('[webhook] GAS response:', response.status, text);
  } catch (err) {
    console.error('[webhook] GASへの転送に失敗:', err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
