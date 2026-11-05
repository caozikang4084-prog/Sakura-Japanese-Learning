// Hepburn-style kana romanization used by vocabulary and shadow-reading hints.
// Kanji readings are never guessed: callers must provide kana reading data.

const ROMAJI_SPECIAL_KANA = {
  ふぁ: 'fa',
  ふぃ: 'fi',
  ふぇ: 'fe',
  ふぉ: 'fo',
  てぃ: 'ti',
  でぃ: 'di',
  うぃ: 'wi',
  うぇ: 'we',
  うぉ: 'wo',
  しぇ: 'she',
  じぇ: 'je',
  ちぇ: 'che',
  ゔぁ: 'va',
  ゔぃ: 'vi',
  ゔぇ: 've',
  ゔぉ: 'vo',
  ぁ: 'a',
  ぃ: 'i',
  ぅ: 'u',
  ぇ: 'e',
  ぉ: 'o',
  ゃ: 'ya',
  ゅ: 'yu',
  ょ: 'yo',
  ゎ: 'wa',
  ゔ: 'vu',
};

const ROMAJI_MACRON = {
  a: 'ā',
  i: 'ī',
  u: 'ū',
  e: 'ē',
  o: 'ō',
};

const ROMAJI_PUNCTUATION = {
  '。': '.',
  '、': ',',
  '！': '!',
  '？': '?',
  '「': '"',
  '」': '"',
  '『': '"',
  '』': '"',
};

function romajiKanaMap() {
  const map = { ...ROMAJI_SPECIAL_KANA };
  if (typeof ALL_KANA !== 'undefined') {
    ALL_KANA.forEach((item) => {
      if (item.hira && item.romaji) map[item.hira] = item.romaji;
    });
  }
  return map;
}

function romajiToHiragana(value) {
  return String(value ?? '').replace(
    /[\u30a1-\u30f6]/g,
    (character) => String.fromCharCode(character.charCodeAt(0) - 0x60),
  );
}

function hiraganaToKatakana(value) {
  return String(value ?? '').replace(
    /[\u3041-\u3096]/g,
    (character) => String.fromCharCode(character.charCodeAt(0) + 0x60),
  );
}

function kanaScriptPair(value) {
  const hiragana = romajiToHiragana(value);
  return {
    hiragana,
    katakana: hiraganaToKatakana(hiragana),
  };
}

function canBeKanaText(character) {
  return /[\u3041-\u30ffー\s。、，,.！!？?「」『』・…〜~:：;；—–-]/.test(
    character,
  );
}

function romanizeKanaText(value) {
  const kana = romajiToHiragana(value).normalize('NFKC');
  const map = romajiKanaMap();
  const tokens = [];
  for (let index = 0; index < kana.length; ) {
    const pair = kana.slice(index, index + 2);
    if (map[pair]) {
      tokens.push({ type: 'kana', value: map[pair], source: pair });
      index += 2;
    } else if (kana[index] === 'ー') {
      tokens.push({ type: 'long' });
      index += 1;
    } else if (kana[index] === 'っ') {
      tokens.push({ type: 'sokuon' });
      index += 1;
    } else {
      tokens.push({
        type: map[kana[index]] ? 'kana' : 'literal',
        value: map[kana[index]] || kana[index],
        source: kana[index],
      });
      index += 1;
    }
  }

  let output = '';
  tokens.forEach((token, index) => {
    if (token.type === 'kana') {
      if (token.source === 'ん') {
        const next = tokens.slice(index + 1).find((item) => item.type === 'kana');
        output += next && /^[aiueoy]/.test(next.value) ? "n'" : 'n';
      } else {
        output += token.value;
      }
      return;
    }
    if (token.type === 'long') {
      const previous = output.at(-1);
      output = `${output.slice(0, -1)}${ROMAJI_MACRON[previous] || previous}`;
      return;
    }
    if (token.type === 'sokuon') {
      const next = tokens.slice(index + 1).find((item) => item.type === 'kana');
      if (next) {
        if (next.value.startsWith('ch')) output += 't';
        else if (/^[bcdfghjklmnpqrstvwxyz]/.test(next.value)) {
          output += next.value[0];
        }
      }
      return;
    }
    output += ROMAJI_PUNCTUATION[token.value] || token.value;
  });
  return output;
}

function romanizeJapanese(textValue, readingValue = '') {
  const text = String(textValue ?? '');
  const suppliedReading = String(readingValue ?? '').trim();
  const candidate =
    suppliedReading ||
    (Array.from(text).every(canBeKanaText) ? text : '');
  const unresolved = Array.from(candidate).filter((character) =>
    /[\u3400-\u9fff]/.test(character),
  );
  if (!candidate || unresolved.length) {
    return {
      ok: false,
      romaji: null,
      reason: unresolved.length
        ? '缺少可靠假名读音，未推测汉字读法'
        : '没有可用的假名读音',
      unresolved,
    };
  }
  return {
    ok: true,
    romaji: romanizeKanaText(candidate),
    source: suppliedReading ? 'reading' : 'kana-text',
    unresolved: [],
  };
}
