'use strict';

// GASの debugLog(line, logContents) をコンソールに置き換え
// line番号はそのままラベルとして使う
function debugLog(line, logContents) {
  if (line === 0) {
    console.log('[LOG] ---- new request ----');
  } else {
    console.log(`[LOG:${line}] ${logContents}`);
  }
}

module.exports = { debugLog };
