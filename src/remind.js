'use strict';

/**
 * GASの CheckNotification() をNode.jsに移植
 *
 * GASでは「calenderData」シートに以下の列構成でイベントを管理していた:
 *   列1: イベント名
 *   列2: 日付 (yyyyMMddHHmm 形式の数値)
 *   列3: 宛先種別 (1=生徒, 2=保護者, その他=両方)
 *   列4: 保護者LINE ID
 *   列5: 生徒LINE ID
 *   列6: 通知済フラグ (0=未通知, 1=通知済)
 *
 * Node.js版では events.json で同じ構造を管理する:
 * [
 *   {
 *     "name": "イベント名",
 *     "date": "yyyyMMddHHmm",   // 例: "202601081200"
 *     "type": 1,                 // 1=生徒, 2=保護者, 3=両方
 *     "parentLineId": "U...",
 *     "studentLineId": "U...",
 *     "notified": false
 *   }
 * ]
 *
 * このスクリプトは node-cron または外部スケジューラ（Renderのcron job等）で
 * 定期的に実行する。
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { sendReminder } = require('./line');

const EVENTS_FILE = path.join(__dirname, '..', 'events.json');

function loadEvents() {
  if (!fs.existsSync(EVENTS_FILE)) return [];
  return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
}

function saveEvents(events) {
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2));
}

/**
 * yyyyMMddHHmm 形式の文字列を数値として返す
 */
function getNow() {
  const now = new Date();
  const jst = new Date(now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return Number(
    `${jst.getFullYear()}${pad(jst.getMonth() + 1)}${pad(jst.getDate())}${pad(jst.getHours())}${pad(jst.getMinutes())}`
  );
}

function getNowYear() {
  const jst = new Date(new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }));
  return Number(`${jst.getFullYear()}00000000`);
}

async function checkNotification() {
  const events = loadEvents();
  const NDate  = getNow();
  const NYear  = getNowYear();
  let changed  = false;

  console.log(`[remind] NDate=${NDate} NYear=${NYear} イベント数=${events.length}`);

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.notified) continue;

    const EDate = Number(ev.date);

    // 終日イベント（HHmm = 0000）
    const isAllDay = EDate % 10000 === 0;

    let shouldNotify = false;
    let displayDate  = String(EDate);

    if (isAllDay) {
      // 今から60分以内（= EDate - NDate < 61）に当日0時が来る → 前日通知相当
      if (EDate - NDate < 61) {
        shouldNotify = true;
        displayDate  = String(EDate);
      }
    } else {
      // 時間指定: 20000分（約14時間）以内
      if (EDate - NDate < 20000) {
        shouldNotify = true;
        // GASと同じく (EDate - NYear) / 10000 で月日+時刻を表示
        displayDate  = String((EDate - NYear) / 10000);
      }
    }

    if (!shouldNotify) continue;

    const contents = displayDate + '\n' + ev.name;

    if (ev.type === 1) {
      // 生徒のみ
      if (ev.studentLineId) await sendReminder(ev.studentLineId, contents);
    } else if (ev.type === 2) {
      // 保護者のみ
      if (ev.parentLineId) await sendReminder(ev.parentLineId, contents);
    } else {
      // 両方
      if (ev.studentLineId) await sendReminder(ev.studentLineId, contents);
      if (ev.parentLineId)  await sendReminder(ev.parentLineId,  contents);
    }

    events[i].notified = true;
    changed = true;
    console.log(`[remind] 通知済: ${ev.name} / ${ev.date}`);
  }

  if (changed) saveEvents(events);
  console.log(`[remind] 完了`);
}

// 単体実行 or require両対応
if (require.main === module) {
  checkNotification().catch(console.error);
}

module.exports = { checkNotification };
