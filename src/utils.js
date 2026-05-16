'use strict';

/**
 * 宛先チェック（GASのCheckAdress相当）
 * contents: Geminiの返答全体
 * address: '生徒' | '保護者' | 'どちらも'
 */
function checkAddress(contents, address) {
  const afterAdresaki = contents.split('宛先')[1];
  if (!afterAdresaki) return false;
  return afterAdresaki.split(':')[1]?.includes(address) ?? false;
}

module.exports = { checkAddress };
