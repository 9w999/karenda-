'use strict';
 
const axios = require('axios');
const { debugLog } = require('./logger');
const { addCalendar } = require('./calendar');
const { parentNotice } = require('./line');
 
const GEMINI_API = process.env.GEMINI_API;
 
const EXPLAIN = "あなたは画像内の文字を正確に読み取るOCRエンジンです。画像に書かれている文字だけを使って処理してください。見えない内容・読み取れない内容は「不明」とし、勝手に作らないでください。ただし、最後に添付する宛先は読み取れない場合は推測してください。【タスク】画像の内容を読み取り、予定、プリントの全体要約の形で出力してください。【出力ルール】時間形式 YYYY/MM/DD/HH/mm:YYYY/MM/DD/HH/mm 終了時間が無い場合は開始時間＝終了時間 ・日付は前述の形式に正規化できる場合のみ出力し正規化できない場合はその予定を出力しない ・YYYYは現在の日付から考える ・宛先、年数を除いて推測は禁止 ・画像に無い情報は禁止 ・不明な場合は出力しない ・現在は2026年である ・時間の表記に:を使わない・改行は使わない ・必ず内容、日時の順で出力すし、必ず,で区切る・予定と要約の間には「,[要約],」というテキストを挟む ・返答の最初には「[予定],」を入れる【宛先判定ルール】画像の文面から判断し、保護者向けなら「保護者」 生徒向けなら「生徒」 両方向けなら「どちらも」最後に必ず 宛先:○○$ を付ける";
 
/**
 * 宛先チェック（GASのCheckAdress相当）
 */
function checkAddress(contents, address) {
  const afterAdresaki = contents.split('宛先')[1];
  if (!afterAdresaki) return false;
  return afterAdresaki.split(':')[1]?.includes(address) ?? false;
}
 
/**
 * geminiRes: 画像バッファを直接Gemini APIに送信 → カレンダー登録 → 保護者通知 → 返信テキストを返す
 * Drive経由なし
 */
async function geminiRes(imageBuffer, userId) {
  debugLog(4, 'GeminiRes');
 
  if (!GEMINI_API) throw new Error('GEMINI_API 環境変数が設定されていません');
 
  const imageBase64 = imageBuffer.toString('base64');
 
  const payload = {
    contents: [{
      parts: [
        { text: EXPLAIN },
        { inlineData: { mimeType: 'image/png', data: imageBase64 } },
      ],
    }],
  };
 
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API}`,
    payload,
    { headers: { 'Content-Type': 'application/json' } }
  );
 
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
 
module.exports = { geminiRes, checkAddress };
 
