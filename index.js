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
    function processImageMessage(event, userId) {
  console.log("ProcessImageMessage");

  var url = 'https://api-data.line.me/v2/bot/message/' + event.message.id + '/content';

  console.log( url)
  try {

    var data = UrlFetchApp.fetch(url, {
      'headers': {
        'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN,
      },
      'method': 'get'
    });


    console.log(data.getResponseCode())

    var imgName = Number(new Date()) + '.png';
    console.log( imgName);
    var img = data.getBlob().getAs('image/png').setName(imgName);
    // ... 画像のダウンロード、Blobの取得、ファイル名の設定 ...
    var folder = DriveApp.getFolderById(GoogleDriveID);
    var file = folder.createFile(img);
    var fileId = file.getId();
  }
  catch (e) {
    console.log("GoogleDriveエラー");
    console.log(e.toString());
    chatReplyText = "エラーが発生しました:E100"
  }

  console.log("DriveConnectionProcessCompleted");

  // GeminiImg 関数を呼び出し、画像IDとプロンプトを渡す

  if (chatReplyText == "0") {

    try {
      chatReplyText = GeminiRes(fileId, userId);////////////////////////////////////////
    } catch (e) {

      console.log("GeminiImgエラー")

      if (e.name == "Exception") {
        const e_msg = e.message

        if (e_msg.includes("サーバー応答")) {

          if (e_msg.includes("429")) {
            console.log("エラー429(短時間にリクエストの送りすぎ、利用上限到達)");
            chatReplyText = "エラーが発生しました:E211\nGeminiへのリクエストが多くなりすぎています。時間をおいて再度実行してください"

          } else if (e_msg.includes("503")) {
            console.log("Geminiのサーバーが混雑している");
            chatReplyText = "エラーが発生しました:E212\nGeminiのサーバーが混雑しています。時間をおいて再度実行してください"

          } else {
            console.log("不明なエラー" + error);
            chatReplyText = "エラーが発生しました:E219"

          }
        } else {
          chatReplyText = "エラーが発生しました:E200"
          console.log(e.name + ",E210," + e.message)
        }

      } else if (e.name == "TypeError") {
        chatReplyText = "エラーが発生しました:E220"
        console.log(e.message)

      } else if (e.name == "ReferenceError") {
        chatReplyText = "エラーが発生しました:E230"
        console.log(e.name + ",E299," + e.message)

      } else {
        chatReplyText = "エラーが発生しました:E299"
        console.log(e.name + ",E299," + e.message)
      }
    }
  }

  // ユーザーに応答を返信
  replyToUser(event.replyToken, chatReplyText);
  console.log("ReplyCompleted");
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
