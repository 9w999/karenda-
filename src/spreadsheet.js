'use strict';

const { google } = require('googleapis');

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

let _cache = null;

/**
 * form シートの全行をキャッシュ付きで取得
 * 列構成（0始まり）:
 *   B列(1): 生徒のカレンダーID
 *   D列(3): 保護者のLINE ID
 *   E列(4): 保護者のカレンダーID
 *   F列(5): userId
 *   G列(6): 保護者のカレンダーID（別パターン）
 */
async function getFormRows() {
  if (_cache) return _cache;
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'form!A:G',
  });
  _cache = res.data.values || [];
  return _cache;
}

function clearCache() {
  _cache = null;
}

/**
 * userIdに一致する行を返す（F列=index5で検索）
 */
async function findRow(userId) {
  const rows = await getFormRows();
  for (const row of rows) {
    if (row[5] === userId) return row;
  }
  console.warn(`[spreadsheet] userId "${userId}" が form シートに見つかりません`);
  return null;
}

/**
 * 生徒・保護者のカレンダーIDを返す
 * 生徒カレンダー: B列、なければG列
 * 保護者カレンダー: E列
 */
async function getCalendarIds(userId) {
  const row = await findRow(userId);
  if (!row) return { studentCal: '', parentCal: '' };

  const studentCal = row[1] || row[6] || ''; // B列、なければG列
  const parentCal  = row[4] || '';            // E列

  return { studentCal, parentCal };
}

/**
 * 保護者のLINE IDを返す（D列）
 */
async function getParentLineId(userId) {
  const row = await findRow(userId);
  if (!row) return '';
  return row[3] || ''; // D列
}

module.exports = { getCalendarIds, getParentLineId, clearCache };
