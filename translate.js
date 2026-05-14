/* ============================================================
   PAHARI ABIRTA — Google Translate Widget (Assamese ↔ English)
   Custom toggle button that wraps Google's free translation.
   ============================================================ */

(function () {
  'use strict';

  // ─── CONFIG ─────────────────────────────────────────────────
  const SOURCE_LANG = 'as'; // Assamese
  const TARGET_LANG = 'en'; // English
  const STORAGE_KEY = 'pa_translate_lang';

  // ─── INJECT TOGGLE BUTTON INTO HEADER ───────────────────────
  function injectToggleButton() {
    const headerActions = document.querySelector('.header__actions');
    if (!headerActions) return;

    // Don't inject twice
    if (document.getElementById('translateToggle')) return;

    const btn = document.createElement('button');
    btn.id = 'translateToggle';
    btn.className = 'header__translate-btn';
    btn.setAttribute('aria-label', 'Translate page');
    btn.setAttribute('title', 'Translate to English');
    btn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
      </svg>
      <span class="translate-btn__label" id="translateLabel">En</span>
    `;

    // Insert before the search button
    const searchBtn = headerActions.querySelector('.header__search-btn');
    if (searchBtn) {
      headerActions.insertBefore(btn, searchBtn);
    } else {
      headerActions.prepend(btn);
    }

    btn.addEventListener('click', toggleTranslation);
  }

  // ─── GOOGLE TRANSLATE INIT ──────────────────────────────────
  let gtScriptLoaded = false;
  let gtRetries = 0;

  function initGoogleTranslate() {
    // Create hidden container for Google Translate widget
    let container = document.getElementById('google_translate_element');
    if (!container) {
      container = document.createElement('div');
      container.id = 'google_translate_element';
      container.style.cssText = 'position:absolute;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
      document.body.appendChild(container);
    }

    // Define the callback Google Translate expects
    window.googleTranslateElementInit = function () {
      new google.translate.TranslateElement({
        pageLanguage: SOURCE_LANG,
        includedLanguages: TARGET_LANG,
        layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
        autoDisplay: false
      }, 'google_translate_element');

      gtScriptLoaded = true;

      // After widget initializes, update button state
      setTimeout(function () {
        updateButtonState();
      }, 800);
    };

    // Load the Google Translate script
    loadGoogleTranslateScript();
  }

  function loadGoogleTranslateScript() {
    const script = document.createElement('script');
    script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
    script.async = true;
    script.onerror = function () {
      gtRetries++;
      if (gtRetries <= 2) {
        // Retry after a delay
        setTimeout(loadGoogleTranslateScript, 2000 * gtRetries);
      }
    };
    document.head.appendChild(script);
  }

  // ─── TRANSLATION CONTROL ───────────────────────────────────
  function toggleTranslation() {
    const btn = document.getElementById('translateToggle');
    if (btn) {
      btn.style.opacity = '0.6';
      btn.style.pointerEvents = 'none';
    }

    const currentLang = getSavedLang();
    if (currentLang === TARGET_LANG) {
      // Switch back to Assamese (original)
      saveLang(SOURCE_LANG);
      clearTranslateCookies();
      window.location.reload();
    } else {
      // Translate to English
      saveLang(TARGET_LANG);
      setTranslateCookie();
      window.location.reload();
    }
  }

  function setTranslateCookie() {
    var domain = window.location.hostname;
    document.cookie = 'googtrans=/' + SOURCE_LANG + '/' + TARGET_LANG + '; path=/';
    if (domain !== 'localhost') {
      document.cookie = 'googtrans=/' + SOURCE_LANG + '/' + TARGET_LANG + '; path=/; domain=.' + domain;
    }
  }

  function clearTranslateCookies() {
    var domain = window.location.hostname;
    // Clear for current path
    document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    // Clear for domain
    if (domain !== 'localhost') {
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.' + domain;
      // Also try without the leading dot
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=' + domain;
    }
  }

  // ─── BUTTON STATE ──────────────────────────────────────────
  function updateButtonState() {
    const btn = document.getElementById('translateToggle');
    const label = document.getElementById('translateLabel');
    if (!btn || !label) return;

    const isTranslated = getSavedLang() === TARGET_LANG;

    if (isTranslated) {
      btn.classList.add('header__translate-btn--active');
      label.textContent = 'অ';
      btn.setAttribute('title', 'Switch to Assamese (Original)');
    } else {
      btn.classList.remove('header__translate-btn--active');
      label.textContent = 'En';
      btn.setAttribute('title', 'Translate to English');
    }
  }

  // ─── HELPERS ───────────────────────────────────────────────
  function getSavedLang() {
    try {
      return localStorage.getItem(STORAGE_KEY) || SOURCE_LANG;
    } catch {
      return SOURCE_LANG;
    }
  }

  function saveLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore storage errors
    }
  }



  // ─── INIT ─────────────────────────────────────────────────
  function init() {
    // On page load: if user chose Assamese (original) but googtrans cookie persists, clear it
    var savedLang = getSavedLang();
    if (savedLang !== TARGET_LANG && document.cookie.indexOf('googtrans') !== -1) {
      // Use a flag to prevent infinite reload loop
      if (!sessionStorage.getItem('pa_clearing_translate')) {
        sessionStorage.setItem('pa_clearing_translate', '1');
        clearTranslateCookies();
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/';
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=' + window.location.hostname;
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.' + window.location.hostname;
        window.location.reload();
        return;
      } else {
        sessionStorage.removeItem('pa_clearing_translate');
      }
    } else {
      sessionStorage.removeItem('pa_clearing_translate');
    }

    injectToggleButton();
    updateButtonState();
    initGoogleTranslate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
