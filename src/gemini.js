'use strict';

const axios = require('axios');
const { debugLog } = require('./logger');

const GAS_URL = process.env.GAS_URL;

/**
 * geminiRes(fileId, userId, replyToken)
 *   GASのdoPost( action:'gemini' ) を呼び出し、
 *   Gemini解析・カレンダー登録・保護者通知を委託する。
 *   GASから返ってきたテキストを返す。
 */
async function geminiRes(fileId, userId, replyToken) {
  debugLog(4, 'geminiRes: GASへ委託開始');

  if (!GAS_URL) {
    throw new Error('GAS_URL 環境変数が設定されていません');
  }

  const response = await axios.post(
    GAS_URL,
    { action: 'gemini', fileId, userId, replyToken },
    { headers: { 'Content-Type': 'application/json' } }
  );

  debugLog(4, 'geminiRes: GAS応答受信');

  // GASが返すのは "ok" などの文字列。
  // 実際のLINE返信はGAS側のreplyToUserで行われるため、
  // ここでは処理完了を示す文字列だけ返す。
  return response.data || 'ok';
}

module.exports = { geminiRes };
