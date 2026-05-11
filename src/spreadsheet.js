'use strict';

const { google } = require('googleapis');

/**
 * Sheets API クライアントを返す
 */
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * user_status シートから userId に一致する行を返す
 *
 * GASでは idsearch シートの H5 にuserIdを書き込んで
 * VLOOKUP等で H6〜H8 を引いていたが、Node.jsでは
 * user_status シートを直接検索する。
 *
 * user_status シートの列構成（GASのgetgmail列番号に対応）:
 *   col1(A): ... （GASのUserSheet col1）
 *   col2(B): LINE の userId
 *   ...
 *   col6(F): 生徒のカレンダーID  ← getgmail(userId, 6)
 *   col7(G): 保護者のカレンダーID ← getgmail(userId, 7)
 *   col8(H): 保護者のLINE ID     ← getParentLineID(userId)
 *
 * ※ 実際の列構成がずれている場合は下記 COL_* 定数を調整してください
 */
const COL_USER_ID    = 1; // B列（0始まり）
const COL_STU_CAL    = 5; // F列（0始まり）← getgmail col6
const COL_PAR_CAL    = 6; // G列（0始まり）← getgmail col7
const COL_PAR_LINE   = 7; // H列（0始まり）← getParentLineID

let _cache = null; // 起動後は一度だけ読み込んでキャッシュ

/**
 * user_status シートの全行をキャッシュ付きで取得する
 */
async function getUserRows() {
  if (_cache) return _cache;

  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range: 'user_status!A1:Z',
  });
  _cache = res.data.values || [];
  return _cache;
}

/**
 * キャッシュをクリアする（データ更新後に呼ぶ）
 */
function clearCache() {
  _cache = null;
}

/**
 * getgmail(userId, col) 相当
 * GASの col番号（1始まり）に対応する値を返す
 *
 * col 6 → 生徒のカレンダーID
 * col 7 → 保護者のカレンダーID
 */
async function getGmail(userId, col) {
  const rows = await getUserRows();
  for (const row of rows) {
    if (row[COL_USER_ID] === userId) {
      return row[col - 1] || ''; // GASはcol 1始まり → 配列は0始まり
    }
  }
  console.warn(`[getGmail] userId "${userId}" が user_status に見つかりません`);
  return '';
}

/**
 * getParentLineID(userId) 相当
 * 保護者のLINE IDを返す
 */
async function getParentLineId(userId) {
  const rows = await getUserRows();
  for (const row of rows) {
    if (row[COL_USER_ID] === userId) {
      return row[COL_PAR_LINE] || '';
    }
  }
  console.warn(`[getParentLineId] userId "${userId}" が user_status に見つかりません`);
  return '';
}

/**
 * 生徒・保護者のカレンダーIDをまとめて返す（calendar.js用）
 */
async function getCalendarIds(userId) {
  const rows = await getUserRows();
  for (const row of rows) {
    if (row[COL_USER_ID] === userId) {
      return {
        studentCal: row[COL_STU_CAL] || '',
        parentCal:  row[COL_PAR_CAL] || '',
      };
    }
  }
  console.warn(`[getCalendarIds] userId "${userId}" が user_status に見つかりません`);
  return { studentCal: '', parentCal: '' };
}

module.exports = { getGmail, getParentLineId, getCalendarIds, clearCache };
