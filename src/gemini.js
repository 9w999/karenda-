'use strict';

const axios = require('axios');
const { debugLog } = require('./logger');
const { addCalendar } = require('./calendar');
const { parentNotice } = require('./line');
const { checkAddress } = require('./utils');

const GEMINI_API = process.env.GEMINI_API;

const EXPLAIN = "あなたは画像内の文字を正確に読み取るOCRエンジンです。【タスク】画像の内容を読み取り、予定の一覧とプリントの全体要約を出力してください。【出力フォーマット】[予定],イベント名1,日時1,イベント名2,日時2,...,[要約],要約文宛先:○○$【日時フォーマット】YYYY/MM/DD/HH/mm:YYYY/MM/DD/HH/mm（終了時間がない場合は開始=終了）【日付の正規化ルール】・現在は2026年・月/日のみの場合は2026/MM/DD/00/00:2026/MM/DD/00/00に変換する・必ずすべての予定を出力する・日付が曖昧でも推測して必ず出力する・時間の表記に:を使わない・改行を使わない・カンマで区切る【禁止事項】・[予定]と[要約]の間以外での改行・予定の省略（必ずすべて出力）【宛先判定】保護者向け→「保護者」、生徒向け→「生徒」、両方→「どちらも」、宛先が指定されていない場合は推測してください。最後に必ず「宛先:○○$」を付ける";

/**
 * geminiRes: 画像バッファを直接Gemini APIに送信 → カレンダー登録 → 保護者通知 → 返信テキストを返す
 * Drive経由なし
 */
async function geminiRes(imageBuffer, userId) {
  debugLog(4, 'GeminiRes');

  if (!GEMINI_API) throw new Error('GEMINI_API 環境変数が設定されていません');

  const imageBase64 = imageBuffer.toString('base64');

  // 画像形式を自動判定（JPEGかPNGか）
  const isPng = imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50;
  const mimeType = isPng ? 'image/png' : 'image/jpeg';

  const payload = {
    contents: [{
      parts: [
        { text: EXPLAIN },
        { inlineData: { mimeType, data: imageBase64 } },
      ],
    }],
  };

  let response;

for (let attempt = 0; attempt < 3; attempt++) {
  try {
    response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API}`,
      payload,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000
      }
    );

    break;

  } catch (e) {
    const status = e.response?.status;

    if ((status === 503 || status === 429) && attempt < 2) {
      const wait = 1000 * Math.pow(2, attempt);

      debugLog(
        25,
        `Gemini ${status} 再試行 ${attempt + 1}/3 ${wait}ms後`
      );

      await new Promise(resolve => setTimeout(resolve, wait));
      continue;
    }

    throw e;
  }
}
  const geminiReply = response.data.candidates[0].content.parts[0].text.trim();
  debugLog(9, geminiReply);
  debugLog(5, '応答処理前');

  // カレンダー登録
  await addCalendar(geminiReply, userId);

  // 返信テキスト生成
  const contents = geminiReply.split('宛先')[0];
  let text = contents + ',,よろしければ要約についてのアンケートにご協力ください\nhttps://forms.gle/Xxm6jmSSqw3zrqmT9';
  text = text.replace(/,/g, '\n');

  // 保護者通知
  if (!checkAddress(geminiReply, '生徒')) {
    await parentNotice(text, userId);
    text = '<保護者へプリントが共有されました>\n\n' + text;
  }

  debugLog(6, '応答処理後');
  debugLog(4, 'TextProcessCompleted');

  return text;
}

module.exports = { geminiRes };
