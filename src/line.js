'use strict';

const axios = require('axios');

const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
// ヘルプ通知先（GASのhardcodedなUserIDと同じ値を環境変数で管理）
const HELP_NOTIFY_USER_ID  = process.env.HELP_NOTIFY_USER_ID || '';

/**
 * replyToUser(replyToken, text)
 *   LINE Reply API でユーザーにメッセージを返す
 */
async function replyToUser(replyToken, text) {
  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    {
      replyToken,
      messages: [{ type: 'text', text: String(text) }],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      },
    }
  );
}

/**
 * pushToUser(userId, text)
 *   LINE Push API でユーザーにメッセージを送る
 */
async function pushToUser(userId, text) {
  await axios.post(
    'https://api.line.me/v2/bot/message/push',
    {
      to: userId,
      messages: [{ type: 'text', text: String(text) }],
    },
    {
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      },
    }
  );
}

/**
 * notifyHelp(input)
 *   ヘルプメッセージを管理者（HELP_NOTIFY_USER_ID）に転送する
 */
async function notifyHelp(input) {
  if (!HELP_NOTIFY_USER_ID) {
    console.warn('[notifyHelp] HELP_NOTIFY_USER_ID が設定されていません');
    return;
  }
  const body = `ヘルプが行われました\n\n${input}`;
  await pushToUser(HELP_NOTIFY_USER_ID, body);
}

module.exports = { replyToUser, pushToUser, notifyHelp };
