'use strict';

const axios = require('axios');
const { debugLog } = require('./logger');

const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// replyToken を使って返信（1回だけ使用可能）
async function replyToUser(replyToken, text) {
  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    { replyToken, messages: [{ type: 'text', text }] },
    {
      headers: {
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

// Push送信（任意のユーザーIDに送れる）
async function pushMessage(toId, text) {
  if (!toId || !text) return;
  await axios.post(
    'https://api.line.me/v2/bot/message/push',
    { to: toId, messages: [{ type: 'text', text }] },
    {
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
      },
    }
  );
}

// 保護者へ要約を通知（GASのParent関数）
async function notifyParentSummary(parentLineId, summary) {
  const body = '生徒からプリントの要約が届きました\n\n' + summary;
  await pushMessage(parentLineId, body);
}

// 保護者へカレンダー追加を通知（GASのParents関数）
async function notifyParentCalendar(parentLineId, eventText) {
  const body = '生徒からカレンダーに' + eventText;
  await pushMessage(parentLineId, body);
}

// 保護者へプリント配布通知（GASのParentNotice関数）
async function notifyParentPrint(parentLineId, contents) {
  const body = '生徒に次の内容の手紙が配布されました\n\n' + contents;
  await pushMessage(parentLineId, body);
}

// ヘルプ通知（GASのhelp関数）
async function notifyHelp(input) {
  const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
  const body = 'ヘルプが行われました\n\n' + input;
  await pushMessage(ADMIN_USER_ID, body);
}

// 予定リマインド通知（GASのNotification関数）
async function sendReminder(toId, contents) {
  const text = '[予定リマインド]\n' + contents;
  await pushMessage(toId, text);
}

module.exports = {
  replyToUser,
  pushMessage,
  notifyParentSummary,
  notifyParentCalendar,
  notifyParentPrint,
  notifyHelp,
  sendReminder,
};
