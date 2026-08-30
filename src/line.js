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

const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

/**
 * 保護者へGmail APIでメール送信
 */
async function parentNotice(contents, userId) {
  const { parentCal } = await require('./spreadsheet').getCalendarIds(userId);
  if (!parentCal) {
    console.warn('[parentNotice] 保護者のメールアドレスが見つかりません userId:', userId);
    return;
  }
  try {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const subject = '【プリントカレンダー】お子さんにプリントが配布されました';
    const body    = `生徒に次の内容の手紙が配布されました\n\n${contents}`;
    const raw = Buffer.from(
      `From: "プリントカレンダー" <${process.env.MAIL_USER}>\r\n` +
      `To: ${parentCal}\r\n` +
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\n` +
      `Content-Type: text/plain; charset=UTF-8\r\n\r\n` +
      body
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
    console.log(`[parentNotice] メール送信完了: ${parentCal}`);
  } catch (e) {
    console.error('[parentNotice] メール送信エラー:', e.message);
    if (e.response?.data) console.error('[parentNotice] 詳細:', JSON.stringify(e.response.data));
  }
}

module.exports = { replyToUser, pushToUser, notifyHelp, parentNotice };
