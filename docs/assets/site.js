/* Urfael: the site's small script, on every page. No dependencies, no build.
   1. The robot's working name: each page declares it once, <meta name="urfael:robot-name" content="…">,
      and this copies it into every [data-robot-name]. The name is also written in the HTML itself, so
      readers without scripting and search engines see it too.
   2. The menu button on narrow screens.
   3. Copy buttons on code blocks, announced through a polite live region.
   4. The speech bubbles: the home hero's, which pops once Uru has waved, and the Uru page's
      "Say hello", which cycles Uru's lines. (figures.js makes the drawing answer the same press.) */
(function () {
  'use strict';

  var doc = document;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* 1. the robot's name */
  var meta = doc.querySelector('meta[name="urfael:robot-name"]');
  var robot = meta && meta.getAttribute('content');
  if (robot) {
    doc.querySelectorAll('[data-robot-name]').forEach(function (el) {
      if (el.textContent !== robot) el.textContent = robot;
    });
  }

  /* 2. the menu */
  var header = doc.querySelector('.site-header');
  var menu = header && header.querySelector('.menu-btn');
  if (menu) {
    var setOpen = function (open) {
      menu.setAttribute('aria-expanded', String(open));
      header.toggleAttribute('data-open', open);
    };
    menu.addEventListener('click', function () { setOpen(menu.getAttribute('aria-expanded') !== 'true'); });
    header.querySelector('.site-nav').addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && header.hasAttribute('data-open')) { setOpen(false); menu.focus(); }
    });
    doc.addEventListener('click', function (e) {
      if (header.hasAttribute('data-open') && !header.contains(e.target)) setOpen(false);
    });
    window.matchMedia('(min-width: 48rem)').addEventListener('change', function (e) {
      if (e.matches) setOpen(false);
    });
  }

  /* 3. copy buttons */
  var status = doc.querySelector('[data-copy-status]');
  var announce = function (text) {
    if (!status) return;
    status.textContent = '';
    window.setTimeout(function () { status.textContent = text; }, 60);
  };
  doc.querySelectorAll('[data-copy]').forEach(function (button) {
    var reset = 0;
    var done = function () {
      button.textContent = 'Copied';
      announce('Copied');
      window.clearTimeout(reset);
      reset = window.setTimeout(function () { button.textContent = 'Copy'; }, 1800);
    };
    var failed = function () { announce('Copy failed. Select the commands and copy them by hand.'); };
    button.addEventListener('click', function () {
      var code = button.parentElement.querySelector('pre code');
      var text = code ? code.textContent : '';
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, failed);
      else failed();
    });
  });

  /* 4a. the home hero's bubble: it pops once, a moment after the drawing is first seen and Uru waves */
  var bubble = doc.querySelector('[data-bubble]');
  if (bubble) {
    var say = function () { bubble.classList.add('is-said'); };
    if (reduced || !('IntersectionObserver' in window)) say();
    else {
      var seen = new IntersectionObserver(function (entries) {
        if (!entries.some(function (e) { return e.isIntersecting; })) return;
        seen.disconnect();
        window.setTimeout(say, 1300);
      }, { threshold: 0.3 });
      seen.observe(bubble.closest('figure') || bubble);
    }
  }

  /* 4b. "Say hello": each press shows Uru's next line */
  var hello = doc.querySelector('[data-say-hello]');
  var line = doc.querySelector('[data-hello-bubble]');
  var lines = Array.prototype.map.call(doc.querySelectorAll('[data-hello-lines] li'), function (li) {
    return li.textContent.trim();
  });
  if (hello && line && lines.length) {
    var at = 0;
    hello.addEventListener('click', function () {
      at = (at + 1) % lines.length;
      line.textContent = lines[at];
      if (reduced) return;
      line.classList.remove('is-popping');
      void line.offsetWidth; // restart the pop
      line.classList.add('is-popping');
    });
  }
})();
