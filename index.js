const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// GASのURLを.envで設定
const GAS_API_URL = process.env.GAS_API_URL;

// GAS呼び出し関数
async function callGasAPI(endpoint, payload) {
  try {
    const res = await axios.post(GAS_API_URL, {
      endpoint,
      ...payload
    });
    return res.data;
  } catch (e) {
    console.error('[GAS ERROR]', e.message);
    return 'エラーが発生しました';
  }
}

// LINE webhook
app.post('/webhook', async (req, res) => {
  const events = req.body.events;

  for (const event of events) {
    if (event.type !== 'message') continue;

    const userId = event.source.userId;
    const replyToken = event.replyToken;

    let text = event.message.text || '';

    // GASに処理を投げる
    const replyText = await callGasAPI('gemini', {
      userId,
      text
    });

    // LINE返信もGASに任せる
    await callGasAPI('reply', {
      replyToken,
      text: replyText
    });
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});
