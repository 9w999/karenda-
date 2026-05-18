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
      const dateStr = start.toISOString().split('T')[0];
      await cal.events.insert({
        calendarId: calId,
        requestBody: {
          summary: title,
          start: { date: dateStr },
          end: { date: dateStr },
        },
      });
    } else {
      await cal.events.insert({
        calendarId: calId,
        requestBody: {
          summary: title,
          start: { dateTime: start.toISOString() },
          end: { dateTime: end.toISOString() },
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
  let calId1 = '';
  let calId2 = '';
  if (isStudent) {
    calId1 = studentCal;
  } else if (isBoth) {
    calId1 = studentCal;
    calId2 = parentCal;
  } else {
    // 保護者宛
    calId1 = parentCal;
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

      const type = startStr === endStr ? 'allday' : 'timed';
      await addEvent(cal, calId1, title, startDate, endDate, type);
      if (calId2) await addEvent(cal, calId2, title, startDate, endDate, type);
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
  // JSTとして解釈（UTC+9）
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
}

/**
 * "YYYY/MM/DD" → Date（終日用・JST）
 */
function parseDateStrAllDay(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length < 3) return null;
  const [year, month, day] = parts.map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

module.exports = { addCalendar };
