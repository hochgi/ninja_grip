/* global i18next */
(function (global) {
  const LANG_KEY = 'ninjagrip_lang';
  const SUPPORTED = ['he-IL', 'en-US'];
  const DEFAULT_LANG = 'he-IL';

  function applyDocumentLang(lng) {
    const rtl = lng === 'he-IL';
    document.documentElement.lang = lng === 'he-IL' ? 'he' : 'en';
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
    document.title = i18next.t('meta.title');
  }

  function applyDomTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = i18next.t(key);
      } else {
        el.textContent = i18next.t(key);
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', i18next.t(el.getAttribute('data-i18n-placeholder')));
    });
  }

  async function loadLocale(lng) {
    const res = await fetch(`locales/${lng}.json`);
    if (!res.ok) throw new Error('Failed to load locale ' + lng);
    return res.json();
  }

  async function initI18n() {
    let saved = localStorage.getItem(LANG_KEY);
    if (!SUPPORTED.includes(saved)) saved = DEFAULT_LANG;

    const [he, en] = await Promise.all([loadLocale('he-IL'), loadLocale('en-US')]);

    await i18next.init({
      lng: saved,
      fallbackLng: 'en-US',
      resources: {
        'he-IL': { translation: he },
        'en-US': { translation: en },
      },
      interpolation: { escapeValue: false },
    });

    applyDocumentLang(i18next.language);
    applyDomTranslations();
    return i18next.language;
  }

  async function setLanguage(lng) {
    if (!SUPPORTED.includes(lng)) return;
    await i18next.changeLanguage(lng);
    localStorage.setItem(LANG_KEY, lng);
    applyDocumentLang(lng);
    applyDomTranslations();
    global.dispatchEvent(new CustomEvent('ninjagrip:langchange', { detail: { lng } }));
  }

  function toggleLanguage() {
    const next = i18next.language === 'he-IL' ? 'en-US' : 'he-IL';
    return setLanguage(next);
  }

  function t(key, opts) {
    return i18next.t(key, opts);
  }

  global.NinjaI18n = {
    initI18n,
    setLanguage,
    toggleLanguage,
    applyDomTranslations,
    t,
    get language() {
      return i18next.language;
    },
  };
})(window);
