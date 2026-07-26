'use strict';

const axios = require('axios');

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

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

/**
 * 保護者へメールで通知する
 */
async function parentNotice(contents, userId) {
  const { parentCal } = await require('./spreadsheet').getCalendarIds(userId);
  if (!parentCal) {
    console.warn('[parentNotice] 保護者のメールアドレスが見つかりません userId:', userId);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"プリントカレンダー" <${process.env.MAIL_USER}>`,
      to: parentCal,
      subject: '【プリントカレンダー】お子さんにプリントが配布されました',
      text: `生徒に次の内容の手紙が配布されました\n\n${contents}`,
    });
    console.log(`[parentNotice] メール送信完了: ${parentCal}`);
  } catch (e) {
    console.error('[parentNotice] メール送信エラー:', e.message);
  }
}

module.exports = { replyToUser, pushToUser, notifyHelp, parentNotice };
