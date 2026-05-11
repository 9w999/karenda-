'use strict';

const { google } = require('googleapis');
const { pushToUser } = require('./line');
const { debugLog } = require('./logger');

/**
 * スプレッドシートからイベントデータを取得してリマインド通知を送る
 * GASの CheckNotification 相当
 *
 * スプレッドシートの calenderData シートの列構成（GASと同じ）:
 *   col1: イベント名
 *   col2: 日時（yyyyMMddHHmm 形式の数値）
 *   col3: 宛先種別（1=生徒のみ, 2=保護者のみ, その他=両方）
 *   col4: 保護者のLINE ID
 *   col5: 生徒のLINE ID
 *   col6: 通知済みフラグ（0=未通知, 1=通知済み）
 */
async function checkNotification() {
  debugLog(1, 'checkNotification: 開始');

  const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
  if (!SPREADSHEET_ID) {
    console.warn('[checkNotification] SPREADSHEET_ID が設定されていません');
    return;
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // シート全体を取得（2行目以降がデータ）
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'calenderData!A2:F',
  });
  const rows = res.data.values || [];

  const now  = new Date();
  const NDate = formatDateNum(now);  // yyyyMMddHHmm
  const NYear = now.getFullYear() * 100000000; // yyyy00000000

  let eventLog = '';
  const updates = [];

  rows.forEach((row, idx) => {
    const rowNum   = idx + 2; // シート上の行番号（1始まり、ヘッダー除く）
    const name     = row[0] || '';
    const EDate    = Number(row[1] || 0);
    const type     = Number(row[2] || 0);
    const parentId = row[3] || '';
    const studentId= row[4] || '';
    const notified = Number(row[5] || 0);

    if (notified !== 0) return; // 通知済みはスキップ

    let shouldNotify = false;

    if (EDate % 10000 === 0) {
      // 時刻なし（月次チェック）
      if (EDate - NDate < 61) shouldNotify = true;
    } else {
      // 時刻あり（月内チェック）
      if (EDate - NDate < 20000) shouldNotify = true;
    }

    if (!shouldNotify) return;

    const displayDate = EDate % 10000 === 0
      ? String((EDate - NYear) / 10000)
      : String(EDate);

    const message = `${displayDate}\n${name}`;

    if (type === 1) {
      pushToUser(studentId, `[予定リマインド]\n${message}`).catch(console.error);
      eventLog += `,${studentId},${EDate},${name}`;
    } else if (type === 2) {
      pushToUser(parentId, `[予定リマインド]\n${message}`).catch(console.error);
      eventLog += `,${parentId},${EDate},${name}`;
    } else {
      pushToUser(studentId, `[予定リマインド]\n${message}`).catch(console.error);
      pushToUser(parentId,  `[予定リマインド]\n${message}`).catch(console.error);
      eventLog += `,${studentId}&${parentId},${EDate},${name}`;
    }

    // 通知済みフラグを立てる（バッチ更新用）
    updates.push({
      range: `calenderData!F${rowNum}`,
      values: [[1]],
    });
  });

  // 通知済みフラグをスプレッドシートに書き込む
  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: updates,
      },
    });
  }

  debugLog(8, `検査完了 ${rows.length}件`);
  debugLog(9, eventLog);
}

/**
 * Date → yyyyMMddHHmm の数値
 */
function formatDateNum(date) {
  const pad = (n, d = 2) => String(n).padStart(d, '0');
  return Number(
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}

module.exports = { checkNotification };
