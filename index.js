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
        log = log + " replyText = processImageMessage(" + JSON.stringify(event)[0] + "," + userId + ")";
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
