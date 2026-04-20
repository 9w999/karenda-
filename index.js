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
    
  // JSONデータのパース
  var receiveJSON = JSON.parse(request.postData.contents);
  var event2 = receiveJSON.events[0];
  const input = event2.message.text

  // ユーザーIDの取得とチェック
  var userId = event2.source.userId;
  var arrUser = Array.prototype.concat.apply([], UserData);
  var i = arrUser.indexOf(userId);
  var replyText;

  //受信したものの分析
  if (event2.type === "message") {
    console.log("1" + current);
    console.log("2" + userId);
    if (event2.message.type === "image") {
      //replyText = processImageMessage(event2, userId);
      console.log("うんこ")
    } else {
      if (input.match("ヘルプ")) {
        //help(input);
        text3 = "担当者にメッセージを送りました\n確認までしばらくお待ちください"
        //replyToUser(event2.replyToken, text3);
        console.log("陳子" + text3)
      }
      else if (input.match("LINE ID確認メッセージ")) {
        const eventData = JSON.parse(request.postData.contents).events[0];
        const userId2 = eventData.source.userId;
        const text2 = `あなたのUser_IDは${userId2}\nです。`;
        console.log("4" + "LINE ID確認メッセージ");
        //replyToUser(event2.replyToken, text2);
      }
      else if (input.match("まえのしゃしんだして")) {
        //getPublicUrl()
        console.log("baka")
      }
    }

    //sheet2.appendRow([current, userId, " ", replyText]); //ログ残すやつ（じかん、id、めっさげ、返信）

  }


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
