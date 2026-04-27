'use strict';

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { debugLog } = require('./logger');
const { getStudentCalendarId, getParentCalendarId } = require('./users');

const EVENTS_FILE = path.join(__dirname, '..', 'events.json');

// Google Calendar API 認証
function getCalendarClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
  return google.calendar({ version: 'v3', auth });
}

// 終日イベント登録
async function createAllDayEvent(calendarId, title, date) {
  const calendar = getCalendarClient();
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: title,
      start: { date: dateStr },
      end: { date: dateStr },
    },
  });
  debugLog(13, `終日イベント登録: ${calendarId} / ${title} / ${dateStr}`);
}

// 時間指定イベント登録
async function createTimedEvent(calendarId, title, startDate, endDate) {
  const calendar = getCalendarClient();
  await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: title,
      start: { dateTime: startDate.toISOString(), timeZone: 'Asia/Tokyo' },
      end: { dateTime: endDate.toISOString(), timeZone: 'Asia/Tokyo' },
    },
  });
  debugLog(13, `時間指定イベント登録: ${calendarId} / ${title}`);
}

/**
 * GASの addcalendar(contents2, userId) をNode.jsに移植
 *
 * Geminiの返答フォーマット:
 *   [予定],内容1,YYYY/MM/DD/HH/mm:YYYY/MM/DD/HH/mm,内容2,...,[要約],要約文宛先:○○$
 *
 * 宛先: 生徒 / 保護者 / どちらも
 */
async function addCalendar(geminiReply, userId) {
  debugLog(3, 'addCalendar start');

  const contents2 = geminiReply;
  const contents = contents2.split('宛先')[0];

  const adressType = getAdressType(contents2);
  const calID  = adressType !== '保護者' ? getStudentCalendarId(userId) : getParentCalendarId(userId);
  const calID2 = adressType === 'どちらも' ? getParentCalendarId(userId) : null;

  debugLog(3, `calID=${calID} calID2=${calID2}`);

  const Eventcontents = contents.split(',[要約]')[0];
  const Summ = contents.split(',[要約]')[1] || '';

  // カンマ区切りから予定を取り出す（[予定], を除く）
  const parts = Eventcontents.split(',');
  // parts[0] = "[予定]", parts[1]=内容, parts[2]=日付, parts[3]=内容, ...
  let text = '';

  for (let i = 1; i + 1 < parts.length; i += 2) {
    const eventTitle = parts[i];
    const eventDate  = parts[i + 1];
    if (!eventTitle || !eventDate) continue;

    const colonIdx = eventDate.indexOf(':');

    if (colonIdx !== -1) {
      // 時間指定イベント: YYYY/MM/DD/HH/mm:YYYY/MM/DD/HH/mm
      const startStr  = eventDate.slice(0, colonIdx);
      const finishStr = eventDate.slice(colonIdx + 1);

      // 開始=終了なら終日として扱う
      if (startStr === finishStr) {
        const [sy, sm, sd] = startStr.split('/');
        const startDate = new Date(+sy, +sm - 1, +sd);
        text += buildAllDayText(eventTitle, +sy, +sm, +sd);
        await addEventToCalendars(calID, calID2, adressType, () =>
          createAllDayEvent(calID, eventTitle, startDate));
        if (calID2) {
          await tryCalendar(() => createAllDayEvent(calID2, eventTitle, startDate));
        }
      } else {
        const [sy, sm, sd, sh, smin] = startStr.split('/').map(Number);
        const [fy, fm, fd, fh, fmin] = finishStr.split('/').map(Number);
        const startDate  = new Date(sy, sm - 1, sd, sh, smin);
        const finishDate = new Date(fy, fm - 1, fd, fh, fmin);

        text += buildTimedText(eventTitle, sy, sm, sd, sh, smin, fy, fm, fd, fh, fmin);

        await tryCalendar(() => createTimedEvent(calID, eventTitle, startDate, finishDate));
        if (calID2) {
          await tryCalendar(() => createTimedEvent(calID2, eventTitle, startDate, finishDate));
        }
      }
    } else {
      // 終日イベント: YYYY/MM/DD
      const [sy, sm, sd] = eventDate.split('/').map(Number);
      const startDate = new Date(sy, sm - 1, sd);
      text += buildAllDayText(eventTitle, sy, sm, sd);
      await tryCalendar(() => createAllDayEvent(calID, eventTitle, startDate));
      if (calID2) {
        await tryCalendar(() => createAllDayEvent(calID2, eventTitle, startDate));
      }
    }
  }

  debugLog(8, 'カレンダー追加完了');

  const result = '以下の内容が追加されました\n[予定]\n' + text + '[要約]\n' + Summ;
  debugLog(3, result);
  return result;
}

// ── ヘルパー ──────────────────────────────────────────────────────────

function getAdressType(contents2) {
  const part = (contents2.split('宛先')[1] || '').split('$')[0].replace(':', '');
  if (part.includes('どちらも')) return 'どちらも';
  if (part.includes('生徒'))   return '生徒';
  return '保護者';
}

async function tryCalendar(fn) {
  try {
    await fn();
  } catch (e) {
    console.error('[Calendar Error]', e.message);
  }
}

function buildAllDayText(title, y, m, d) {
  return `${title} ${y}年${m}月${d}日\n`;
}

function buildTimedText(title, sy, sm, sd, sh, smin, fy, fm, fd, fh, fmin) {
  return `${title} ${sy}年${sm}月${sd}日${sh}時${String(smin).padStart(2,'0')}分~${fy}年${fm}月${fd}日${fh}時${String(fmin).padStart(2,'0')}分\n`;
}

// イベントデータをJSONファイルに保存（リマインド用）
function saveEvent(event) {
  const events = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
  events.push(event);
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}

function loadEvents() {
  return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
}

function markEventNotified(index) {
  const events = loadEvents();
  events[index].notified = true;
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}

module.exports = {
  addCalendar,
  saveEvent,
  loadEvents,
  markEventNotified,
};
