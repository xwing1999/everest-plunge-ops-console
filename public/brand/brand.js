// Everest Plunge brand layer: highlight the current page in the nav and add
// the footer signature. Loaded on every console page.
(function () {
  var path = location.pathname.replace(/\/$/, '');
  document.querySelectorAll('body > header nav a').forEach(function (a) {
    var href = (a.getAttribute('href') || '').replace(/\/$/, '');
    if (href && href === path) a.setAttribute('aria-current', 'page');
  });
  var main = document.querySelector('main');
  if (main && !document.querySelector('.ep-footer')) {
    var f = document.createElement('div');
    f.className = 'ep-footer';
    f.innerHTML = '<img src="/brand/favicon.png" alt="">Everest Plunge · Reach Your Peak';
    main.after(f);
  }
})();
