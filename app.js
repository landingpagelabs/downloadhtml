/* ========================================
   Download HTML — App
   ======================================== */

(function () {
  'use strict';

  // DOM refs
  const urlForm = document.getElementById('urlForm');
  const urlInput = document.getElementById('urlInput');
  const fetchBtn = document.getElementById('fetchBtn');
  const loadingBar = document.getElementById('loadingBar');
  const errorMsg = document.getElementById('errorMsg');
  const results = document.getElementById('results');
  const emptyState = document.getElementById('emptyState');
  const codeBlock = document.getElementById('codeBlock');
  const codeViewer = document.getElementById('codeViewer');
  const toolbarLabel = document.getElementById('toolbarLabel');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const prettyBtn = document.getElementById('prettyBtn');
  const minifyBtn = document.getElementById('minifyBtn');
  const wrapBtn = document.getElementById('wrapBtn');
  const requestBody = document.getElementById('requestBody');
  const metaBody = document.getElementById('metaBody');
  const headersBody = document.getElementById('headersBody');
  const assetBody = document.getElementById('assetBody');

  // State
  let currentHTML = '';
  let currentURL = '';
  let isPretty = true;
  let isWrapped = false;

  // ---- Fetch URL ----

  urlForm.addEventListener('submit', function (e) {
    e.preventDefault();
    fetchURL();
  });

  async function fetchURL() {
    let url = urlInput.value.trim();
    if (!url) return;

    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }

    showLoading(true);
    hideError();
    results.classList.remove('visible');

    try {
      const res = await fetch('/api/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch the URL.');
      }

      currentHTML = data.html;
      currentURL = data.url || url;
      isPretty = false;

      displayCode(currentHTML);
      displayRequestInfo(data);
      displayMetaTags(data.html);
      displayHeaders(data.headers);
      displayAssets(data.html, currentURL);

      toolbarLabel.textContent = currentURL;
      emptyState.classList.add('hidden');
      results.classList.add('visible');

      // Auto pretty-print
      doPrettyPrint();

      // Open request info panel by default
      document.getElementById('requestPanel').classList.add('open');

    } catch (err) {
      showError(err.message);
    } finally {
      showLoading(false);
    }
  }

  // ---- Code display ----

  function displayCode(html) {
    const scrollTop = codeViewer.scrollTop;
    codeBlock.textContent = html;
    Prism.highlightElement(codeBlock);
    codeViewer.scrollTop = scrollTop;
  }

  // ---- Pretty print / Minify ----

  prettyBtn.addEventListener('click', doPrettyPrint);
  minifyBtn.addEventListener('click', doMinify);

  function doPrettyPrint() {
    if (isPretty) return;
    currentHTML = prettyPrintHTML(currentHTML);
    isPretty = true;
    prettyBtn.classList.add('active');
    minifyBtn.classList.remove('active');
    displayCode(currentHTML);
  }

  function doMinify() {
    if (!isPretty) return;
    currentHTML = minifyHTML(currentHTML);
    isPretty = false;
    minifyBtn.classList.add('active');
    prettyBtn.classList.remove('active');
    displayCode(currentHTML);
  }

  function prettyPrintHTML(html) {
    let formatted = '';
    let indent = 0;
    const tab = '  ';

    // Normalize and split into tokens
    html = html.replace(/>\s*</g, '>\n<');
    const lines = html.split('\n');

    const voidTags = new Set([
      'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
      'link', 'meta', 'param', 'source', 'track', 'wbr'
    ]);

    lines.forEach(function (line) {
      line = line.trim();
      if (!line) return;

      const isClosing = /^<\//.test(line);
      const isSelfClosing = /\/>$/.test(line);
      const tagMatch = line.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
      const isVoid = tagMatch && voidTags.has(tagMatch[1].toLowerCase());
      const isDoctype = /^<!doctype/i.test(line);
      const isComment = /^<!--/.test(line);

      if (isClosing) {
        indent = Math.max(0, indent - 1);
      }

      formatted += tab.repeat(indent) + line + '\n';

      if (!isClosing && !isSelfClosing && !isVoid && !isDoctype && !isComment && tagMatch) {
        indent++;
      }
    });

    return formatted.trim();
  }

  function minifyHTML(html) {
    return html
      .replace(/\n/g, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/>\s+</g, '><')
      .trim();
  }

  // ---- Word wrap ----

  wrapBtn.addEventListener('click', function () {
    isWrapped = !isWrapped;
    codeViewer.classList.toggle('wrap-on', isWrapped);
    wrapBtn.classList.toggle('active', isWrapped);
  });

  // ---- Copy ----

  copyBtn.addEventListener('click', function () {
    navigator.clipboard.writeText(currentHTML).then(function () {
      toast('Copied to clipboard');
    });
  });

  // ---- Download ----

  downloadBtn.addEventListener('click', function () {
    let filename = 'source.html';
    try {
      const hostname = new URL(currentURL).hostname.replace(/^www\./, '');
      filename = hostname + '.html';
    } catch (e) {}

    const blob = new Blob([currentHTML], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Downloading ' + filename);
  });

  // ---- Request Info ----

  function displayRequestInfo(data) {
    let statusClass = 'status-ok';
    if (data.status >= 300 && data.status < 400) statusClass = 'status-redirect';
    if (data.status >= 400) statusClass = 'status-error';

    const sizeKB = (data.size / 1024).toFixed(1);

    requestBody.innerHTML =
      '<div class="request-stat">' +
        '<span class="request-stat-label">Status</span>' +
        '<span class="request-stat-value ' + statusClass + '">' + data.status + ' ' + (data.statusText || '') + '</span>' +
      '</div>' +
      '<div class="request-stat">' +
        '<span class="request-stat-label">Size</span>' +
        '<span class="request-stat-value">' + sizeKB + ' KB</span>' +
      '</div>' +
      '<div class="request-stat">' +
        '<span class="request-stat-label">Fetch time</span>' +
        '<span class="request-stat-value">' + data.fetchTime + ' ms</span>' +
      '</div>' +
      '<div class="request-stat">' +
        '<span class="request-stat-label">Final URL</span>' +
        '<span class="request-stat-value" style="word-break:break-all">' + escapeHTML(data.url || '') + '</span>' +
      '</div>';
  }

  // ---- Meta Tags ----

  function displayMetaTags(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const tags = [];

    function add(key, value) {
      if (value) tags.push({ key: key, value: value });
    }

    add('title', doc.title);
    add('description', getMetaContent(doc, 'description'));
    add('keywords', getMetaContent(doc, 'keywords'));
    add('og:title', getMetaProperty(doc, 'og:title'));
    add('og:description', getMetaProperty(doc, 'og:description'));
    add('og:image', getMetaProperty(doc, 'og:image'));
    add('og:type', getMetaProperty(doc, 'og:type'));
    add('og:url', getMetaProperty(doc, 'og:url'));
    add('twitter:card', getMetaContent(doc, 'twitter:card') || getMetaProperty(doc, 'twitter:card'));
    add('twitter:title', getMetaContent(doc, 'twitter:title') || getMetaProperty(doc, 'twitter:title'));
    add('twitter:description', getMetaContent(doc, 'twitter:description') || getMetaProperty(doc, 'twitter:description'));

    const canonical = doc.querySelector('link[rel="canonical"]');
    add('canonical', canonical ? canonical.getAttribute('href') : null);

    const favicon = doc.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
    add('favicon', favicon ? favicon.getAttribute('href') : null);

    const viewport = getMetaContent(doc, 'viewport');
    add('viewport', viewport);

    if (tags.length === 0) {
      metaBody.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem">No meta tags found</p>';
      return;
    }

    metaBody.innerHTML = tags.map(function (t) {
      return '<div class="meta-row">' +
        '<span class="meta-key">' + escapeHTML(t.key) + '</span>' +
        '<span class="meta-value" data-copy="' + escapeAttr(t.value) + '">' + escapeHTML(t.value) + '</span>' +
      '</div>';
    }).join('');

    // Click to copy individual values
    metaBody.querySelectorAll('.meta-value').forEach(function (el) {
      el.addEventListener('click', function () {
        navigator.clipboard.writeText(el.getAttribute('data-copy')).then(function () {
          el.classList.add('copied');
          setTimeout(function () { el.classList.remove('copied'); }, 800);
        });
      });
    });
  }

  function getMetaContent(doc, name) {
    const el = doc.querySelector('meta[name="' + name + '"]') ||
               doc.querySelector('meta[name="' + name.toLowerCase() + '"]');
    return el ? el.getAttribute('content') : null;
  }

  function getMetaProperty(doc, prop) {
    const el = doc.querySelector('meta[property="' + prop + '"]');
    return el ? el.getAttribute('content') : null;
  }

  // ---- Response Headers ----

  function displayHeaders(headers) {
    if (!headers || Object.keys(headers).length === 0) {
      headersBody.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem">No headers</p>';
      return;
    }

    headersBody.innerHTML = Object.entries(headers).map(function (pair) {
      return '<div class="meta-row">' +
        '<span class="meta-key">' + escapeHTML(pair[0]) + '</span>' +
        '<span class="meta-value" data-copy="' + escapeAttr(pair[1]) + '">' + escapeHTML(pair[1]) + '</span>' +
      '</div>';
    }).join('');

    headersBody.querySelectorAll('.meta-value').forEach(function (el) {
      el.addEventListener('click', function () {
        navigator.clipboard.writeText(el.getAttribute('data-copy')).then(function () {
          el.classList.add('copied');
          setTimeout(function () { el.classList.remove('copied'); }, 800);
        });
      });
    });
  }

  // ---- Assets ----

  function displayAssets(html, baseURL) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const stylesheets = [];
    const scripts = [];
    const images = [];
    const fonts = [];

    doc.querySelectorAll('link[rel="stylesheet"]').forEach(function (el) {
      const href = el.getAttribute('href');
      if (href) stylesheets.push(resolveURL(href, baseURL));
    });

    doc.querySelectorAll('script[src]').forEach(function (el) {
      const src = el.getAttribute('src');
      if (src) scripts.push(resolveURL(src, baseURL));
    });

    doc.querySelectorAll('img[src]').forEach(function (el) {
      const src = el.getAttribute('src');
      if (src) images.push(resolveURL(src, baseURL));
    });

    // Detect font links
    doc.querySelectorAll('link[href*="fonts"]').forEach(function (el) {
      const href = el.getAttribute('href');
      if (href && !stylesheets.includes(href)) fonts.push(resolveURL(href, baseURL));
    });

    const allURLs = [].concat(stylesheets, scripts, images, fonts);

    if (allURLs.length === 0) {
      assetBody.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem">No assets found</p>';
      return;
    }

    let html_out = '';

    function renderGroup(label, urls) {
      if (urls.length === 0) return '';
      return '<div class="asset-group">' +
        '<div class="asset-group-label">' + label + ' (' + urls.length + ')</div>' +
        urls.map(function (u) {
          return '<a class="asset-link" href="' + escapeAttr(u) + '" target="_blank" rel="noopener">' + escapeHTML(u) + '</a>';
        }).join('') +
      '</div>';
    }

    html_out += renderGroup('Stylesheets', stylesheets);
    html_out += renderGroup('Scripts', scripts);
    html_out += renderGroup('Images', images);
    html_out += renderGroup('Fonts', fonts);

    html_out += '<button class="btn btn-sm copy-all-btn" id="copyAllAssets">Copy All URLs</button>';

    assetBody.innerHTML = html_out;

    document.getElementById('copyAllAssets').addEventListener('click', function () {
      navigator.clipboard.writeText(allURLs.join('\n')).then(function () {
        toast('Copied ' + allURLs.length + ' URLs');
      });
    });
  }

  function resolveURL(url, base) {
    if (/^https?:\/\//i.test(url) || url.startsWith('//')) return url;
    try {
      return new URL(url, base).href;
    } catch (e) {
      return url;
    }
  }

  // ---- Panel toggles ----

  document.querySelectorAll('.panel-header').forEach(function (btn) {
    btn.addEventListener('click', function () {
      btn.closest('.panel').classList.toggle('open');
    });
  });

  // ---- Helpers ----

  function showLoading(on) {
    loadingBar.classList.toggle('active', on);
    fetchBtn.disabled = on;
    if (on) fetchBtn.querySelector('span').textContent = 'Fetching...';
    else fetchBtn.querySelector('span').textContent = 'Fetch';
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.add('visible');
  }

  function hideError() {
    errorMsg.classList.remove('visible');
  }

  function escapeHTML(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function toast(msg) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();

    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);

    requestAnimationFrame(function () {
      el.classList.add('visible');
    });

    setTimeout(function () {
      el.classList.remove('visible');
      setTimeout(function () { el.remove(); }, 200);
    }, 2000);
  }

  // ---- Share via query param ----

  function checkQueryParam() {
    var params = new URLSearchParams(window.location.search);
    var url = params.get('url');
    if (url) {
      urlInput.value = url.replace(/^https?:\/\//, '');
      fetchURL();
    }
  }

  checkQueryParam();

})();
