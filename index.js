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
