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
