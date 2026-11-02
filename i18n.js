/* Language IDs/mapping reference: Sainome main 82055351bf8c8b0bae3fa3e00172325eff1d0237, blob709c519490340067a39350ea652a3e861f54849f. */
(function(root){
'use strict';
const SUPPORTED_LANGUAGES = Object.freeze([
  { id: 'ja', name: '日本語', locale: 'ja-JP' },
  { id: 'en', name: 'English', locale: 'en-US' },
  { id: 'es', name: 'Español', locale: 'es-ES' },
  { id: 'pt-BR', name: 'Português (Brasil)', locale: 'pt-BR' },
  { id: 'zh-Hans', name: '简体中文', locale: 'zh-CN' },
  { id: 'fr', name: 'Français', locale: 'fr-FR' },
  { id: 'de', name: 'Deutsch', locale: 'de-DE' },
  { id: 'ko', name: '한국어', locale: 'ko-KR' },
  { id: 'ru', name: 'Русский', locale: 'ru-RU' },
  { id: 'it', name: 'Italiano', locale: 'it-IT' },
  { id: 'zh-Hant', name: '繁體中文', locale: 'zh-TW' },
  { id: 'id', name: 'Bahasa Indonesia', locale: 'id-ID' },
  { id: 'tr', name: 'Türkçe', locale: 'tr-TR' },
  { id: 'vi', name: 'Tiếng Việt', locale: 'vi-VN' },
  { id: 'th', name: 'ไทย', locale: 'th-TH' }
].map(Object.freeze));

function isSupportedLanguage(language) {
  return SUPPORTED_LANGUAGES.some(({ id }) => id === language);
}

function getLanguageLocale(language) {
  return SUPPORTED_LANGUAGES.find(({ id }) => id === language)?.locale ?? 'en-US';
}

function languageFromLocale(locale) {
  if (typeof locale !== 'string') return null;
  const tag = locale.trim().toLowerCase().replaceAll('_', '-');
  const parts = tag.split('-');
  const base = parts[0];
  if (base === 'zh') {
    if (parts.includes('hant')) return 'zh-Hant';
    if (parts.includes('hans')) return 'zh-Hans';
    return parts.some((part) => ['tw', 'hk', 'mo'].includes(part)) ? 'zh-Hant' : 'zh-Hans';
  }
  if (base === 'pt') return 'pt-BR';
  return isSupportedLanguage(base) ? base : null;
}

function create(options = {}) {
  const catalogs = options.catalogs || {};
  const key = 'suiteki_catch_language_v1';
  const available = value => isSupportedLanguage(value) && Object.hasOwn(catalogs, value);
  let saved = null;
  try { saved = options.storage?.getItem(key) ?? null; } catch (_) {}
  const browserCandidates = Array.isArray(options.browserLanguages) ? options.browserLanguages : [];
  const preferred = [...browserCandidates, options.browserLanguage].map(languageFromLocale).find(available);
  let language = available(saved) ? saved : preferred || 'en';
  function setLanguage(value) {
    if (!available(value)) return false;
    language = value;
    try { options.storage?.setItem(key, value); } catch (_) {}
    return true;
  }
  function t(name, values = {}) {
    const selected = catalogs[language];
    const fallback = catalogs.en;
    const value = selected && Object.hasOwn(selected, name) ? selected[name] : undefined;
    const english = fallback && Object.hasOwn(fallback, name) ? fallback[name] : undefined;
    const template = typeof value === 'string' ? value : typeof english === 'string' ? english : String(name);
    return template.replace(/\{(\w+)\}/g, (whole, token) => Object.hasOwn(values, token) ? String(values[token]) : whole);
  }
  return Object.freeze({ get language() { return language; }, setLanguage, t });
}
root.SuitekiI18n = Object.freeze({ options: SUPPORTED_LANGUAGES, languageFromLocale, create });
})(globalThis);
