'use strict';

const { google } = require('googleapis');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn, label, maxRetry = 3) {
  let lastError;

  for (let i = 1; i <= maxRetry; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      console.error(`[${label}] 失敗 ${i}/${maxRetry}:`, e.message);

      if (i < maxRetry) {
        await sleep(1000 * i);
      }
    }
  }

  throw lastError;
}

async function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON が設定されていません');
  }

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  return google.sheets({ version: 'v4', auth });
}

let _cache = null;
let _cacheTime = 0;

async function getFormRows() {
  const now = Date.now();

  // 5分キャッシュ。毎回Google認証しに行かないようにする
  if (_cache && now - _cacheTime < 5 * 60 * 1000) {
    return _cache;
  }

  return await withRetry(async () => {
    const sheets = await getSheetsClient();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SPREADSHEET_ID,
      range: 'form!A:G',
    });

    const rows = res.data.values || [];
    console.log(`[spreadsheet] form シート取得成功: ${rows.length}行`);

    _cache = rows;
    _cacheTime = Date.now();

    return rows;
  }, 'spreadsheet getFormRows');
}

function clearCache() {
  _cache = null;
  _cacheTime = 0;
}

async function findRow(userId) {
  const rows = await getFormRows();
  for (const row of rows) {
    if (row[5] === userId) return row;
  }
  console.warn(`[spreadsheet] userId "${userId}" が form シートに見つかりません`);
  return null;
}

async function getCalendarIds(userId) {
  const row = await findRow(userId);
  if (!row) return { studentCal: '', parentCal: '' };

  const studentCal = row[1] || row[6] || '';
  const parentCal  = row[4] || '';

  return { studentCal, parentCal };
}

async function getParentLineId(userId) {
  const row = await findRow(userId);
  if (!row) return '';
  return row[3] || '';
}

module.exports = { getCalendarIds, getParentLineId, clearCache };
