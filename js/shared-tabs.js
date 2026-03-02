/* ============================================================
   EM Zoo — Shared Tab, Theme & Math Utilities
   Provides tab switching, KaTeX auto-render, and theme init.
   Public API: window.EMZoo.tabs { init, initTabs, initMath, initTheme }
   ============================================================ */
(function () {
    'use strict';

    /* ---------- Tab switching ---------- */
    function initTabs(tabBtnSelector, tabContentSelector) {
        var btns = document.querySelectorAll(tabBtnSelector || '.item-tab-btn');
        var panels = document.querySelectorAll(tabContentSelector || '.item-tab-content');

        btns.forEach(function (btn) {
            btn.addEventListener('click', function () {
                var target = btn.getAttribute('data-tab');
                btns.forEach(function (b) { b.classList.remove('item-tab-btn--active'); });
                panels.forEach(function (p) { p.classList.remove('item-tab-content--active'); });
                btn.classList.add('item-tab-btn--active');
                var panel = document.getElementById('tab-' + target);
                if (panel) panel.classList.add('item-tab-content--active');
            });
        });
    }

    /* ---------- KaTeX auto-render ---------- */
    var KATEX_DELIMITERS = [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false }
    ];

    function doRenderMath() {
        if (typeof renderMathInElement === 'function') {
            renderMathInElement(document.body, {
                delimiters: KATEX_DELIMITERS,
                throwOnError: false
            });
        }
    }

    function initMath() {
        // KaTeX scripts use defer, so they may not be ready yet.
        if (typeof renderMathInElement === 'function') {
            doRenderMath();
        } else {
            document.addEventListener('DOMContentLoaded', doRenderMath);
            window.addEventListener('load', doRenderMath);
        }
    }

    /* ---------- Theme from localStorage ---------- */
    function initTheme(localStorageKey) {
        var key = localStorageKey || 'emzoo_theme';
        var saved = localStorage.getItem(key);
        if (saved) {
            document.documentElement.setAttribute('data-theme', saved);
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            document.documentElement.setAttribute('data-theme', 'light');
        }
    }

    /* ---------- Init all ---------- */
    function init(opts) {
        opts = opts || {};
        initTheme(opts.themeKey);
        initTabs(opts.tabBtnSelector, opts.tabContentSelector);
        initMath();
    }

    /* ---------- Public API ---------- */
    window.EMZoo = window.EMZoo || {};
    window.EMZoo.tabs = {
        init: init,
        initTabs: initTabs,
        initMath: initMath,
        initTheme: initTheme
    };
})();
