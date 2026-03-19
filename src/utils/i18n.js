const path = require('path');

let currentLocale = 'zh';
const cache = {};

function loadLocale(locale) {
  if (cache[locale]) return cache[locale];
  try {
    cache[locale] = require(path.join(__dirname, '..', 'locales', `${locale}.json`));
  } catch {
    cache[locale] = {};
  }
  return cache[locale];
}

/**
 * Translate a key with optional template parameters
 * @param {string} key - dot-notation key, e.g. 'banner.subtitle'
 * @param {Object} [params] - template variables, e.g. { name: 'foo' }
 * @returns {string}
 */
function t(key, params) {
  const strings = loadLocale(currentLocale);
  let str = strings[key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), v);
    }
  }
  return str;
}

/**
 * Translate with pluralization (English only; Chinese uses single form)
 * Looks for key_one / key_other suffixes.
 * @param {string} key - base key without _one/_other suffix
 * @param {number} count
 * @param {Object} [params] - extra template vars (count is injected automatically)
 * @returns {string}
 */
function tp(key, count, params = {}) {
  const strings = loadLocale(currentLocale);
  params.count = count;

  if (currentLocale === 'en') {
    const suffix = count === 1 ? 'one' : 'other';
    const pluralKey = `${key}_${suffix}`;
    if (strings[pluralKey]) {
      let str = strings[pluralKey];
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), v);
      }
      return str;
    }
  }

  // Fallback: try base key, then key directly
  let str = strings[key] || key;
  for (const [k, v] of Object.entries(params)) {
    str = str.replace(new RegExp('\\{\\{' + k + '\\}\\}', 'g'), v);
  }
  return str;
}

function setLocale(locale) {
  currentLocale = locale;
}

function getLocale() {
  return currentLocale;
}

function detectLocale() {
  const env = process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || '';
  if (env.startsWith('en')) return 'en';
  return 'zh';
}

module.exports = { t, tp, setLocale, getLocale, detectLocale };
