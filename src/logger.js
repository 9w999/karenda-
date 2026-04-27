'use strict';

/**
 * debugLog(col, value)
 *   col === 0 : ログ行を挿入（Node.js版では区切り線を出力）
 *   col >= 1  : GASのsheet2.getRange(4, col) に対応するコンソール出力
 */
function debugLog(col, value) {
  if (col === 0) {
    console.log('[debug] ----');
  } else {
    console.log(`[debug][col:${col}]`, value !== undefined ? value : '');
  }
}

module.exports = { debugLog };
