'use strict';

const axios = require('axios');
const { google } = require('googleapis');
const { debugLog } = require('./logger');
const { addCalendar } = require('./calendar');
const { notifyParentPrint, notifyParentCalendar } = require('./line');
const { getParentLineId } = require('./users');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL   = 'gemini-2.5-flash';
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const EXPLAIN = `あなたは画像内の文字を正確に読み取るOCRエンジンです。画像に書かれている文字だけを使って処理してください。見えない内容・読み取れない内容は「不明」とし、勝手に作らないでください。ただし、最後に添付する宛先は読み取れない場合は推測してください。【タスク】画像の内容を読み取り、予定、プリントの全体要約の形で出力してください。【出力ルール】時間形式 YYYY/MM/DD/HH/mm:YYYY/MM/DD/HH/mm 終了時間が無い場合は開始時間＝終了時間 ・日付は前述の形式に正規化できる場合のみ出力し正規化できない場合はその予定を出力しない ・YYYYは現在の日付から考える ・宛先、年数を除いて推測は禁止 ・画像に無い情報は禁止 ・不明な場合は出力しない ・現在は2026年である ・時間の表記に:を使わない・改行は使わない ・必ず内容、日時の順で出力すし、必ず,で区切る・予定と要約の間には「,[要約],」というテキストを挟む ・返答の最初には「[予定],」を入れる【宛先判定ルール】画像の文面から判断し、保護者向けなら「保護者」 生徒向けなら「生徒」 両方向けなら「どちらも」最後に必ず 宛先:○○$ を付ける`;

/**
 * Google Drive から画像をダウンロードしてbase64に変換
 */
async function fetchImageAsBase64(fileId) {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });

  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(res.data).toString('base64');
}

/**
 * Gemini に画像を送り、解析結果テキストを返す
 */
async function callGemini(base64Image) {
  const payload = {
    contents: [{
      parts: [
        { text: EXPLAIN },
        { inlineData: { mimeType: 'image/png', data: base64Image } },
      ],
    }],
  };

  const res = await axios.post(GEMINI_URL, payload, {
    headers: { 'Content-Type': 'application/json' },
  });

  return res.data.candidates[0].content.parts[0].text.trim();
}

/**
 * GASの GeminiRes(imageID, userID) をNode.jsに移植
 *
 * 1. Driveから画像取得
 * 2. Gemini解析
 * 3. カレンダー登録
 * 4. 保護者通知
 * 5. Driveから画像削除
 * 6. LINEに返すテキストを返す
 */
async function geminiRes(fileId, userId) {
  debugLog(4, 'GeminiRes start');

  // ① Drive から画像をbase64で取得
  const base64Image = await fetchImageAsBase64(fileId);
  debugLog(9, 'Drive画像取得完了');

  // ② Gemini に送って解析
  const geminiReply = await callGemini(base64Image);
  debugLog(9, geminiReply);
  debugLog(5, '応答処理前');

  // ③ カレンダー登録
  const calendarText = await addCalendar(geminiReply, userId);

  // ④ 宛先判定
  const adressPart = (geminiReply.split('宛先')[1] || '').split('$')[0].replace(':', '');
  const isStudent  = adressPart.includes('生徒');
  const isBoth     = adressPart.includes('どちらも');

  // ⑤ 返信テキスト構築
  let text = calendarText + '\n\nよろしければ要約についてのアンケートにご協力ください\nhttps://forms.gle/Xxm6jmSSqw3zrqmT9';

  // ⑥ 保護者への通知
  if (!isStudent) {
    // 保護者宛 or どちらも
    const parentLineId = getParentLineId(userId);
    if (parentLineId) {
      await notifyParentPrint(parentLineId, text);
      debugLog(6, '保護者通知送信完了');
    }
    text = '<保護者へプリントが共有されました>\n\n' + text;
  }

  // ⑦ Drive から画像を削除
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });
    await drive.files.delete({ fileId });
    debugLog(6, 'Drive画像削除完了');
  } catch (e) {
    console.error('[Drive削除エラー]', e.message);
  }

  debugLog(4, 'GeminiRes完了');
  return text;
}

module.exports = { geminiRes };
