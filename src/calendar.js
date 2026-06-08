'use strict';

const { google } = require('googleapis');
const { debugLog } = require('./logger');
const { checkAddress } = require('./utils');
const { getCalendarIds } = require('./spreadsheet');

/**
 * Google Calendar API クライアント取得
 */
async function getCalendarClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

/**
 * 1件のイベントをGoogleカレンダーに追加
 * type: 'timed' | 'allday'
 */
async function addEvent(cal, calId, title, start, end, type) {
  if (!calId) return;
  try {
    if (type === 'allday') {
      // start は "YYYY-MM-DD" 文字列
      await cal.events.insert({
        calendarId: calId,
        requestBody: {
          summary: title,
          start: { date: start },
          end:   { date: start },
        },
      });
    } else {
      await cal.events.insert({
        calendarId: calId,
        requestBody: {
          summary: title,
          start: { dateTime: start.toISOString(), timeZone: 'Asia/Tokyo' },
          end:   { dateTime: end.toISOString(),   timeZone: 'Asia/Tokyo' },
        },
      });
    }
  } catch (e) {
    console.error(`[addEvent] カレンダー追加エラー (${calId}):`, e.message);
    if (e.response?.data) console.error('[addEvent] 詳細:', JSON.stringify(e.response.data));
  }
}

/**
 * addCalendar: GASのaddcalendar相当
 * Geminiの返答テキストを解析してGoogleカレンダーに登録する
 *
 * Gemini出力フォーマット:
 *   [予定],イベント名,YYYY/MM/DD/HH/mm:YYYY/MM/DD/HH/mm,...,[要約],要約テキスト宛先:○○$
 *   時刻なしの終日イベントは Start == End (HH/mm が 00/00)
 */
async function addCalendar(geminiReply, userId) {
  debugLog(3, 'addCalendar開始');

  const { studentCal, parentCal } = await getCalendarIds(userId);
  debugLog(3, `studentCal=${studentCal} parentCal=${parentCal}`);
  const isStudent = checkAddress(geminiReply, '生徒');
  const isBoth    = checkAddress(geminiReply, 'どちらも');

  // 宛先に応じてカレンダーIDを決定
  // 「生徒」「どちらも」「保護者」以外（「個人」など）は生徒扱い
  let calId1 = '';
  let calId2 = '';
  if (isBoth) {
    calId1 = studentCal;
    calId2 = parentCal;
  } else if (checkAddress(geminiReply, '保護者')) {
    calId1 = parentCal;
  } else {
    // 生徒・個人・その他すべて生徒カレンダーへ
    calId1 = studentCal;
  }

  debugLog(3, `calId1=${calId1} calId2=${calId2}`);

  // 予定部分だけ取り出す（[予定], ～ ,[要約] の間）
  const contents = geminiReply.split('宛先')[0];
  const eventSection = contents.split(',[要約]')[0];
  const eventItems   = eventSection.replace('[予定],', '').split(',');
  // 偶数インデックス=イベント名, 奇数インデックス=日時

  const cal = await getCalendarClient();

  for (let i = 0; i + 1 < eventItems.length; i += 2) {
    const title    = eventItems[i].trim();
    const dateStr  = eventItems[i + 1]?.trim();
    if (!title || !dateStr) continue;

    if (dateStr.includes(':')) {
      // 時刻あり
      const [startStr, endStr] = dateStr.split(':');
      const startDate = parseDateStr(startStr);
      const endDate   = parseDateStr(endStr);
      if (!startDate || !endDate) continue;

      // 開始・終了が同じ → 終日イベント
      if (startStr === endStr || (isZeroTime(startStr) && isZeroTime(endStr))) {
        const allDayDate = parseDateStrAllDay(startStr);
        await addEvent(cal, calId1, title, allDayDate, null, 'allday');
        if (calId2) await addEvent(cal, calId2, title, allDayDate, null, 'allday');
      } else {
        await addEvent(cal, calId1, title, startDate, endDate, 'timed');
        if (calId2) await addEvent(cal, calId2, title, startDate, endDate, 'timed');
      }
    } else {
      // 終日
      const startDate = parseDateStrAllDay(dateStr);
      if (!startDate) continue;
      await addEvent(cal, calId1, title, startDate, null, 'allday');
      if (calId2) await addEvent(cal, calId2, title, startDate, null, 'allday');
    }
  }

  debugLog(8, 'カレンダー追加完了');
}

/**
 * 時刻部分が 00/00 または 0000 かどうか判定
 */
function isZeroTime(str) {
  const parts = str.split('/');
  if (parts.length === 5) return parts[3] === '00' && parts[4] === '00';
  if (parts.length === 4) return parts[3] === '0000' || parts[3] === '00';
  return true;
}

/**
 * "YYYY/MM/DD/HH/mm" または "YYYY/MM/DD/HHmm" → Date (JST)
 */
function parseDateStr(str) {
  if (!str) return null;
  const parts = str.split('/');
  let year, month, day, hour, minute;
  if (parts.length === 5) {
    [year, month, day, hour, minute] = parts.map(Number);
  } else if (parts.length === 4) {
    const hhmm = parts[3];
    year   = Number(parts[0]);
    month  = Number(parts[1]);
    day    = Number(parts[2]);
    hour   = Math.floor(Number(hhmm) / 100);
    minute = Number(hhmm) % 100;
  } else {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
}

/**
 * 終日イベント用: "YYYY/MM/DD/..." → "YYYY-MM-DD" 文字列をそのまま返す
 */
function parseDateStrAllDay(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length < 3) return null;
  const year  = parts[0].padStart(4, '0');
  const month = parts[1].padStart(2, '0');
  const day   = parts[2].padStart(2, '0');
  return `${year}-${month}-${day}`;
}

module.exports = { addCalendar };
