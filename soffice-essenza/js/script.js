/* Soffice Essenza — shared interactions */
(function () {
  'use strict';

  /* Nav: scrolled state + mobile sheet toggle */
  var nav = document.querySelector('.nav');
  var toggle = document.querySelector('.nav__toggle');
  var sheet = document.querySelector('.nav__sheet');

  function onScroll() {
    if (!nav) return;
    nav.classList.toggle('is-scrolled', window.scrollY > 40);
    updateProgress();
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if (toggle && sheet && nav) {
    toggle.addEventListener('click', function () {
      nav.classList.toggle('is-open');
      sheet.classList.toggle('is-open');
    });
    sheet.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        nav.classList.remove('is-open');
        sheet.classList.remove('is-open');
      });
    });
  }

  /* Scroll progress bar */
  var progress = document.querySelector('.progress');
  function updateProgress() {
    if (!progress) return;
    var h = document.documentElement;
    var scrolled = h.scrollTop || document.body.scrollTop;
    var height = (h.scrollHeight || document.body.scrollHeight) - h.clientHeight;
    var pct = height > 0 ? (scrolled / height) * 100 : 0;
    progress.style.width = pct + '%';
  }

  /* Reveal-on-scroll */
  var revealEls = document.querySelectorAll('[data-reveal]');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });

    revealEls.forEach(function (el, i) {
      el.style.setProperty('--delay', (i % 4) * 0.09 + 's');
      io.observe(el);
    });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* Highlight active nav link based on current page */
  var here = (window.location.pathname.split('/').pop() || 'index.html');
  document.querySelectorAll('.nav__links a, .nav__sheet a').forEach(function (a) {
    var target = a.getAttribute('href');
    if (target === here || (here === '' && target === 'index.html')) {
      a.classList.add('is-active');
    }
  });

  /* Subtle parallax on hero floating shapes */
  var shapes = document.querySelectorAll('[data-parallax]');
  if (shapes.length) {
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      shapes.forEach(function (el) {
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.15;
        el.style.transform = 'translate3d(0,' + (y * speed) + 'px,0)';
      });
    }, { passive: true });
  }

  /* Year in footer */
  var yearEl = document.querySelector('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
