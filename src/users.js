'use strict';

const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(__dirname, '..', 'users.json');

function loadUsers() {
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

/**
 * GASの getgmail(id, 6) → 生徒カレンダーID
 * GASの getgmail(id, 7) → 保護者カレンダーID
 * GASの getgmail(id, 8) → 保護者LINE ID
 */
function getUserByStudentId(studentLineId) {
  const users = loadUsers();
  return users.find(u => u.studentLineId === studentLineId) || null;
}

function getStudentCalendarId(studentLineId) {
  const user = getUserByStudentId(studentLineId);
  return user ? user.studentCalendarId : null;
}

function getParentCalendarId(studentLineId) {
  const user = getUserByStudentId(studentLineId);
  return user ? user.parentCalendarId : null;
}

function getParentLineId(studentLineId) {
  const user = getUserByStudentId(studentLineId);
  return user ? user.parentLineId : null;
}

module.exports = {
  getStudentCalendarId,
  getParentCalendarId,
  getParentLineId,
};
