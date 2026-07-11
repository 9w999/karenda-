const express = require('express');
const axios   = require('axios');
const cron = require('node-cron');
const multer = require('multer');

const { debugLog }            = require('./src/logger');
const { replyToUser, notifyHelp } = require('./src/line');
const { geminiRes }           = require('./src/gemini');
const { checkNotification }   = require('./src/remind');
const { getCalendarIds }      = require('./src/spreadsheet');
const { google }              = require('googleapis');

const path   = require('path');

const app    = express();
const upload = multer({ storage: multer.memoryStorage() });
app.use(express.json());

// LIFF静的ファイル配信
app.use('/liff', express.static(path.join(__dirname, 'liff')));

// LIFF からのアクセスを許可
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

const PORT                 = process.env.PORT || 3000;
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ── ヘルスチェック ──────────────────────────────────────────────────
app.get('/', (req, res) => res.send('LINE Bot Server is running.'));

// ── LINE Webhook ────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  debugLog(0);
  console.log('[webhook] received:', JSON.stringify(req.body));

  res.status(200).send('OK');

  const events = req.body.events || [];

  for (const event of events) {
    const userId = event.source?.userId;
    debugLog(1, new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
    debugLog(2, userId);

    if (event.type !== 'message') continue;

    if (event.message.type === 'image') {
      // 複数枚同時送信の場合は1枚目のみ処理、それ以外は案内メッセージ
      const imageSet = event.message.imageSet;
      if (imageSet && imageSet.total > 1) {
        if (imageSet.index === 1) {
          await replyToUser(event.replyToken, '複数枚の写真が送られました。\n1枚ずつ送ってください。');
        }
        continue;
      }
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

  // ② Gemini 解析 → カレンダー登録 → 保護者通知（Drive不要、バッファ直接渡し）
  if (chatReplyText === '0' && imageBuffer) {
    try {
      chatReplyText = await geminiRes(imageBuffer, userId);
    } catch (e) {
      debugLog(8, 'GeminiImgエラー');
      chatReplyText = getGeminiErrorText(e);
    }
  }

  // ③ LINE へ返信
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
  if (e.response?.data) {
    debugLog(25, 'Gemini詳細エラー: ' + JSON.stringify(e.response.data));
  }
  debugLog(25, 'E299: ' + e.name + ' / ' + e.message);
  return 'エラーが発生しました:E299';
}

// ── LIFF: 画像アップロード ──────────────────────────────────────────
app.post('/upload', upload.single('image'), async (req, res) => {
  const userId = req.body.userId;
  if (!userId || !req.file) {
    return res.status(400).json({ error: 'userId と image が必要です' });
  }
  try {
    const replyText = await geminiRes(req.file.buffer, userId);
    res.json({ ok: true, message: replyText });
  } catch (e) {
    console.error('[/upload] エラー:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── LIFF: カレンダーイベント取得 ───────────────────────────────────
app.get('/events', async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId が必要です' });

  try {
    const { studentCal, parentCal } = await getCalendarIds(userId);
    const calId = studentCal || parentCal;
    console.log(`[/events] userId=${userId} calId=${calId}`);
    if (!calId) return res.json([]);

    const auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });
    const cal = google.calendar({ version: 'v3', auth });

    // year/monthパラメータで対象月を指定（なければ現在月）
    const now   = new Date();
    const year  = parseInt(req.query.year)  || now.getFullYear();
    const month = parseInt(req.query.month) || now.getMonth() + 1;
    const start = new Date(year, month - 1, 1).toISOString();
    const end   = new Date(year, month, 0, 23, 59, 59).toISOString();

    const result = await cal.events.list({
      calendarId: calId,
      timeMin: start,
      timeMax: end,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 100,
    });

    const items = (result.data.items || []).map(ev => ({
      name:   ev.summary || '（無題）',
      start:  ev.start.dateTime || ev.start.date,
      end:    ev.end.dateTime   || ev.end.date,
      allDay: !!ev.start.date,
    }));

    res.json(items);
  } catch (e) {
    console.error('[/events] エラー:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── サーバー起動 ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
