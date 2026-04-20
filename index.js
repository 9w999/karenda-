const express = require('express');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// =============================
// 設定（環境変数で管理）
// =============================
const GAS_URL = process.env.GAS_URL; // RenderのダッシュボードでGASのWebアプリURLを設定
const PORT = process.env.PORT || 3000;

// =============================
// ヘルスチェック用
// =============================
app.get('/', (req, res) => {
  res.send('LINE Webhook Relay Server is running.');
});

// =============================
// LINEからWebhookを受け取りGASに転送
// =============================
app.post('/webhook', async (req, res) => {
  console.log('[webhook] received:', JSON.stringify(req.body));

  // LINEにはまず200を即返す（タイムアウト対策）
  res.status(200).send('OK');

  const events = req.body.events || [];
  for (const event of events) {
 console.log("うんこ")
  }

  if (!GAS_URL) {
    console.error('[webhook] GAS_URL が設定されていません');
    return;
  }

  try {
    const response = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      // GASのdoPostはリダイレクトされるので followRedirects が必要
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
