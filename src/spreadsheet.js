'use strict';

const { google } = require('googleapis');

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * form シートの全行を取得
 * 列構成（0始まり）:
 *   B列(1): 生徒のカレンダーID
 *   D列(3): 保護者のLINE ID
 *   E列(4): 保護者のカレンダーID
 *   I列(8): LIFF userId / LINE userId
 */
async function getFormRows() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'form!A:I',
  });
  const rows = res.data.values || [];
  console.log(`[spreadsheet] form シート取得成功: ${rows.length}行`);
  return rows;
}

function clearCache() {}

async function findRow(userId) {
  const rows = await getFormRows();
  for (const row of rows) {
    if (row[8] === userId) return row; // I列
  }
  console.warn(`[spreadsheet] userId "${userId}" が form シートに見つかりません`);
  return null;
}

async function getCalendarIds(userId) {
  const row = await findRow(userId);
  if (!row) return { studentCal: '', parentCal: '' };
  return {
    studentCal: row[1] || '', // B列
    parentCal:  row[4] || '', // E列
  };
}

async function getParentLineId(userId) {
  const row = await findRow(userId);
  if (!row) return '';
  return row[3] || ''; // D列
}

module.exports = { getCalendarIds, getParentLineId, clearCache };
