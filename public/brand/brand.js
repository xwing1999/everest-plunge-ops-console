// Everest Plunge brand layer: highlight the current page in the nav and add
// the footer signature. Loaded on every console page.
// Product label: product names now match Pipely exactly (e.g. "Obsidian
// Outdoor Sauna - 2 Person"), so don't repeat the size when the name
// already contains it.
window.epLabel = function (name, size) {
  name = name || ''; size = size || '';
  var n = name.toLowerCase().replace(/[^a-z0-9]/g, ''), s = size.toLowerCase().replace(/[^a-z0-9]/g, '');
  return !s || n.indexOf(s) !== -1 ? name : name + ' — ' + size;
};

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
