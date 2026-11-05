const fs = require('fs');

const SAVE_APP = 'nihongo-journey';
const SAVE_FORMAT = 1;
const MAX_SAVE_BYTES = 10 * 1024 * 1024;

function looksLikeState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return ['kana', 'words', 'grammar', 'quizzes', 'activity', 'stats', 'streak'].some(
    (key) => key in value,
  );
}

function buildSaveFile(state, date = new Date()) {
  return {
    app: SAVE_APP,
    format: SAVE_FORMAT,
    exportedAt: date.toISOString(),
    state,
  };
}

function parseSaveFile(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('文件不是有效的 JSON 存档');
  }

  const state = data && typeof data.state === 'object' ? data.state : data;
  if (!looksLikeState(state)) {
    throw new Error('不是日语次元的学习存档');
  }

  return {
    state,
    exportedAt: typeof data?.exportedAt === 'string' ? data.exportedAt : null,
  };
}

async function writeSaveFile(filePath, state, date = new Date()) {
  await fs.promises.writeFile(
    filePath,
    JSON.stringify(buildSaveFile(state, date), null, 2),
    'utf8',
  );
}

async function readSaveFile(filePath) {
  const stat = await fs.promises.stat(filePath);
  if (stat.size > MAX_SAVE_BYTES) throw new Error('存档文件过大');
  const raw = await fs.promises.readFile(filePath, 'utf8');
  return parseSaveFile(raw);
}

module.exports = { buildSaveFile, parseSaveFile, readSaveFile, writeSaveFile };
