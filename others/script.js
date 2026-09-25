/* Rajan Gyawali: site scripts */
(function () {
  // Email links, assembled on the client to reduce scraping
  document.querySelectorAll('.js-email').forEach(function (a) {
    var addr = a.getAttribute('data-user') + '@' + a.getAttribute('data-domain');
    a.href = 'mailto:' + addr;
    a.title = addr;
  });

  // Images: try the repo-relative path, then the live site, then hide
  document.querySelectorAll('img[data-fallback]').forEach(function (img) {
    var queue = img.getAttribute('data-fallback').split(/\s+/).filter(Boolean);
    function fail() {
      var next = queue.shift();
      if (next) { img.src = next; return; }
      var portrait = img.closest('.portrait');
      if (portrait) portrait.classList.add('missing');
    }
    img.addEventListener('error', fail);
    if (img.complete && img.naturalWidth === 0) fail();
  });
  document.querySelectorAll('.pub-thumb img').forEach(function (img) {
    function fail() { var pub = img.closest('.pub'); if (pub) pub.classList.add('no-thumb'); }
    img.addEventListener('error', fail);
    if (img.complete && img.naturalWidth === 0) fail();
  });

  // Lightbox
  var dlg = document.getElementById('lightbox');
  var body = document.getElementById('lightbox-body');
  var titleEl = document.getElementById('lightbox-title');
  var opener = null;
  // Agents diagram: the same SVG serves as the in-page figure and the enlarged view
  var agentsTpl = document.getElementById('agents-figure');
  document.querySelectorAll('.work-fig .svg-slot').forEach(function (slot) {
    var svg = agentsTpl.content.firstElementChild.cloneNode(true);
    svg.removeAttribute('role'); svg.removeAttribute('aria-labelledby');
    var t = svg.querySelector('title'); if (t) t.remove();
    slot.appendChild(svg);
  });
  function openFigure(btn) {
    opener = btn;
    body.textContent = '';
    var article = btn.closest('.work');
    titleEl.textContent = article ? article.querySelector('h3').textContent : 'Figure';
    var fig = document.createElement('figure');
    fig.className = 'lightbox-fig';
    var tpl = btn.getAttribute('data-template');
    if (tpl) {
      var wrap = document.createElement('div');
      wrap.className = 'svg-scroll';
      wrap.appendChild(document.getElementById(tpl).content.firstElementChild.cloneNode(true));
      fig.appendChild(wrap);
    } else {
      var thumb = btn.querySelector('img');
      var frame = document.createElement('div');
      frame.className = 'fig-frame';
      var img = document.createElement('img');
      img.alt = thumb.alt;
      var fullFb = btn.getAttribute('data-full-fallback');
      img.addEventListener('error', function () { if (fullFb && img.src !== fullFb) img.src = fullFb; });
      img.src = btn.getAttribute('data-full') || thumb.currentSrc || thumb.src;
      frame.appendChild(img);
      fig.appendChild(frame);
    }
    var caption = btn.getAttribute('data-caption');
    if (caption) {
      var cap = document.createElement('figcaption');
      var lead = document.createElement('b');
      lead.textContent = 'Figure. ';
      cap.appendChild(lead);
      cap.appendChild(document.createTextNode(caption));
      fig.appendChild(cap);
    }
    body.appendChild(fig);
    var hint = document.createElement('p');
    hint.className = 'lightbox-hint';
    hint.textContent = 'Press Esc to close.';
    body.appendChild(hint);
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    document.getElementById('lightbox-close').focus();
  }
  document.querySelectorAll('.work-fig').forEach(function (btn) {
    btn.addEventListener('click', function () { openFigure(btn); });
  });
  document.getElementById('lightbox-close').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', function () {
    body.textContent = '';
    if (opener) { opener.focus(); opener = null; }
  });

  // Publication filter
  var buttons = document.querySelectorAll('.filters button');
  var pubs = document.querySelectorAll('.pub');
  function matches(p, f) {
    if (f === 'all') return true;
    if (f === 'selected') return p.getAttribute('data-selected') === 'true';
    return p.getAttribute('data-type') === f;
  }
  function apply(f) {
    buttons.forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-filter') === f)); });
    pubs.forEach(function (p) { p.hidden = !matches(p, f); });
    document.querySelectorAll('.year-group').forEach(function (g) {
      g.hidden = !g.querySelector('.pub:not([hidden])');
    });
  }
  buttons.forEach(function (b) {
    var f = b.getAttribute('data-filter');
    var n = Array.prototype.filter.call(pubs, function (p) { return matches(p, f); }).length;
    b.querySelector('.count').textContent = '(' + n + ')';
    b.addEventListener('click', function () { apply(f); });
  });
  apply('selected');

  // BibTeX toggles and copy
  document.querySelectorAll('.bib-toggle').forEach(function (btn) {
    var box = document.getElementById(btn.getAttribute('aria-controls'));
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      box.hidden = open;
    });
  });
  document.querySelectorAll('.bib-copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.parentNode.querySelector('pre').textContent;
      function done() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1600); }
      function fallback() {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
    });
  });

  // Simulated micrograph with particle picking
  var canvas = document.getElementById('micrograph');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var off = document.createElement('canvas');
  var octx = off.getContext('2d');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var S = 0.7; // generation scale relative to CSS pixels, softens the grain
  var W = 0, H = 0, dpr = 1, particles = [], raf = 0, t0 = 0, inView = true;
  var SCAN = 6500, HOLD = 3000;

  function gauss() {
    var u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function generate() {
    var w = Math.max(1, Math.round(W * S)), h = Math.max(1, Math.round(H * S));
    off.width = w; off.height = h;
    var img = octx.createImageData(w, h), d = img.data;
    var gx = 12, gy = 4, grid = [], i, j;
    for (j = 0; j <= gy; j++) { grid[j] = []; for (i = 0; i <= gx; i++) grid[j][i] = gauss() * 9; }

    particles = [];
    var target = Math.round(w * h / 1500), tries = 0;
    while (particles.length < target && tries < target * 60) {
      tries++;
      var r = 5 + Math.random() * 3.5;
      var x = r + 3 + Math.random() * (w - 2 * r - 6);
      var y = r + 3 + Math.random() * (h - 2 * r - 6);
      var ok = particles.every(function (p) { var dx = p.x - x, dy = p.y - y; return dx * dx + dy * dy > Math.pow(p.r + r + 4, 2); });
      if (ok) particles.push({ x: x, y: y, r: r, a: Math.random() * Math.PI, e: 0.6 + Math.random() * 0.4 });
    }

    var dens = new Float32Array(w * h);
    particles.forEach(function (p) {
      var R = Math.ceil(p.r * 1.8), ca = Math.cos(p.a), sa = Math.sin(p.a);
      for (var yy = Math.max(0, Math.floor(p.y - R)); yy < Math.min(h, Math.ceil(p.y + R)); yy++) {
        for (var xx = Math.max(0, Math.floor(p.x - R)); xx < Math.min(w, Math.ceil(p.x + R)); xx++) {
          var dx = xx - p.x, dy = yy - p.y;
          var u = (dx * ca + dy * sa) / p.r, v = (-dx * sa + dy * ca) / (p.r * p.e);
          var q = u * u + v * v, rq = Math.sqrt(q);
          dens[yy * w + xx] += Math.exp(-q * 1.5) - 0.3 * Math.exp(-Math.pow(rq - 1.25, 2) * 7);
        }
      }
    });

    for (var y2 = 0; y2 < h; y2++) {
      var fy = y2 / h * gy, j0 = Math.floor(fy), ty = fy - j0, j1 = Math.min(j0 + 1, gy);
      for (var x2 = 0; x2 < w; x2++) {
        var fx = x2 / w * gx, i0 = Math.floor(fx), tx = fx - i0, i1 = Math.min(i0 + 1, gx);
        var ice = (grid[j0][i0] * (1 - tx) + grid[j0][i1] * tx) * (1 - ty) + (grid[j1][i0] * (1 - tx) + grid[j1][i1] * tx) * ty;
        var k = y2 * w + x2;
        var c = 132 + ice - 40 * dens[k] + gauss() * 24;
        c = c < 0 ? 0 : c > 255 ? 255 : c;
        d[k * 4] = d[k * 4 + 1] = d[k * 4 + 2] = c;
        d[k * 4 + 3] = 255;
      }
    }
    octx.putImageData(img, 0, 0);
    particles.sort(function (a, b) { return a.x - b.x; });
  }

  function pickColor() {
    return getComputedStyle(document.documentElement).getPropertyValue('--pick').trim() || '#e0a106';
  }

  function draw(progress) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, W, H);
    var color = pickColor();
    var scanX = progress * W;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    particles.forEach(function (p) {
      var px = p.x / S, py = p.y / S, pr = p.r / S * 1.45;
      if (px > scanX) return;
      var k = reduce ? 1 : Math.min(1, (scanX - px) / 36);
      ctx.globalAlpha = 0.35 + 0.65 * k;
      ctx.beginPath();
      ctx.arc(px, py, pr * (1.3 - 0.3 * k), 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
    if (!reduce && scanX < W) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(scanX, 0, 1.5, H);
      ctx.globalAlpha = 1;
    }
  }

  function size() {
    var rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    generate();
    t0 = performance.now();
    draw(reduce ? 1.05 : 0);
  }

  function frame(now) {
    raf = 0;
    if (!inView || document.hidden) return;
    var t = now - t0;
    if (t > SCAN + HOLD) { generate(); t0 = now; t = 0; }
    draw(Math.min(1.05, t / SCAN * 1.05));
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (reduce || raf) return;
    raf = requestAnimationFrame(frame);
  }

  size();
  start();

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { size(); start(); }, 150);
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) start(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView) start();
    }).observe(canvas);
  }
})();
