'use strict';

const axios = require('axios');
const { debugLog } = require('./logger');
const { addCalendar } = require('./calendar');
const { parentNotice } = require('./line');
const { checkAddress } = require('./utils');

const GOOGLE_VISION_API_KEY = process.env.GOOGLE_VISION_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const EXPLAIN =
  "あなたは学校プリントの内容を整理するAIです。" +
  "以下のOCR結果から、予定の一覧とプリントの全体要約を出力してください。" +
  "【出力フォーマット】" +
  "[予定],イベント名1,日時1,イベント名2,日時2,...,[要約],要約文宛先:○○$" +
  "【日時フォーマット】" +
  "YYYY/MM/DD/HH/mm:YYYY/MM/DD/HH/mm" +
  "（終了時間がない場合は開始=終了）" +
  "【日付の正規化ルール】" +
  "・現在は2026年" +
  "・月/日のみの場合は2026/MM/DD/00/00:2026/MM/DD/00/00に変換する" +
  "・必ずすべての予定を出力する" +
  "・日付が曖昧な場合は文脈から推測する" +
  "・時間の表記に:を使わない" +
  "・改行を使わない" +
  "・カンマで区切る" +
  "【宛先判定】" +
  "保護者向け→保護者、生徒向け→生徒、両方→どちらも。" +
  "最後に必ず「宛先:○○$」を付ける。";


async function extractTextWithVision(imageBuffer) {
  if (!GOOGLE_VISION_API_KEY) {
    throw new Error('GOOGLE_VISION_API_KEY が設定されていません');
  }

  const imageBase64 = imageBuffer.toString('base64');

  const payload = {
    requests: [
      {
        image: {
          content: imageBase64
        },
        features: [
          {
            type: 'DOCUMENT_TEXT_DETECTION'
          }
        ],
        imageContext: {
          languageHints: ['ja']
        }
      }
    ]
  };

  const response = await axios.post(
    `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );

  const result = response.data?.responses?.[0];

  if (result?.error) {
    throw new Error(
      `Vision API エラー: ${result.error.message}`
    );
  }

  const text =
    result?.fullTextAnnotation?.text ||
    result?.textAnnotations?.[0]?.description;

  if (!text) {
    throw new Error('画像から文字を読み取れませんでした');
  }

  return text;
}


async function organizeWithGroq(ocrText) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY が設定されていません');
  }

  const payload = {
    model: 'openai/gpt-oss-120b',
    messages: [
      {
        role: 'system',
        content: EXPLAIN
      },
      {
        role: 'user',
        content:
          '以下がGoogle Vision OCRで読み取ったプリント全文です。\n\n' +
          ocrText
      }
    ],
    temperature: 0.1
  };

  let response;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        payload,
        {
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );

      break;

    } catch (e) {
      const status = e.response?.status;

      console.error(
        '[Groq] detail:',
        JSON.stringify(e.response?.data)
      );

      if (
        (status === 429 || status >= 500) &&
        attempt < 2
      ) {
        const wait = 2000 * Math.pow(2, attempt);

        debugLog(
          25,
          `Groq ${status} 再試行 ${attempt + 1}/3 ${wait}ms後`
        );

        await new Promise(resolve =>
          setTimeout(resolve, wait)
        );

        continue;
      }

      throw e;
    }
  }

  const reply =
    response?.data?.choices?.[0]?.message?.content?.trim();

  if (!reply) {
    throw new Error('Groqから応答を取得できませんでした');
  }

  return reply;
}


async function geminiRes(imageBuffer, userId) {
  // index.jsとの互換性のため関数名はそのまま
  debugLog(4, 'VisionOCRStart');

  const ocrText =
    await extractTextWithVision(imageBuffer);

  debugLog(
    4,
    `VisionOCRCompleted length=${ocrText.length}`
  );

  const aiReply =
    await organizeWithGroq(ocrText);

  debugLog(9, aiReply);
  debugLog(5, '応答処理前');

  await addCalendar(aiReply, userId);

  const contents =
    aiReply.split('宛先')[0];

  let text =
    contents +
    ',,よろしければ要約についてのアンケートにご協力ください\n' +
    'https://forms.gle/Xxm6jmSSqw3zrqmT9';

  text =
    text.replace(/,/g, '\n');

  if (!checkAddress(aiReply, '生徒')) {
    await parentNotice(text, userId);

    text =
      '<保護者へプリントが共有されました>\n\n' +
      text;
  }

  debugLog(6, '応答処理後');
  debugLog(4, 'TextProcessCompleted');

  return text;
}

module.exports = { geminiRes };
