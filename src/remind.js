'use strict';

const axios = require('axios');
const { debugLog } = require('./logger');

const GAS_URL = process.env.GAS_URL;

/**
 * checkNotification()
 *   GASのCheckNotification関数をHTTP経由で呼び出す。
 *   cron（毎時0分・30分）から実行される。
 */
async function checkNotification() {
  debugLog(1, 'checkNotification: 開始');

  if (!GAS_URL) {
    console.warn('[checkNotification] GAS_URL が設定されていません');
    return;
  }

  const response = await axios.post(
    GAS_URL,
    { action: 'checkNotification' },
    { headers: { 'Content-Type': 'application/json' } }
  );

  debugLog(1, `checkNotification: 完了 (${response.status})`);
}

module.exports = { checkNotification };
