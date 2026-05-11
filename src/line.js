'use strict';

const axios = require('axios');
const { getParentLineId } = require('./spreadsheet');

const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const HELP_NOTIFY_USER_ID  = process.env.HELP_NOTIFY_USER_ID || '';

/**
 * LINE Reply API でユーザーにメッセージを返す
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
 * LINE Push API でユーザーにメッセージを送る
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
 * ヘルプメッセージを管理者（HELP_NOTIFY_USER_ID）に転送する
 */
async function notifyHelp(input) {
  if (!HELP_NOTIFY_USER_ID) {
    console.warn('[notifyHelp] HELP_NOTIFY_USER_ID が設定されていません');
    return;
  }
  await pushToUser(HELP_NOTIFY_USER_ID, `ヘルプが行われました\n\n${input}`);
}

/**
 * 保護者へプリント内容を通知する（GASのParentNotice相当）
 * 保護者のLINE IDは user_status シートから取得する
 */
async function parentNotice(contents, userId) {
  const parentId = await getParentLineId(userId);
  if (!parentId) {
    console.warn('[parentNotice] 保護者のLINE IDが見つかりません userId:', userId);
    return;
  }
  const body = `生徒に次の内容の手紙が配布されました\n\n${contents}`;
  await pushToUser(parentId, body);
}

module.exports = { replyToUser, pushToUser, notifyHelp, parentNotice };
