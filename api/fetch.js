const rateLimit = new Map();

const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;
const FETCH_TIMEOUT = 10000;

function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimit.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimit.set(ip, { windowStart: now, count: 1 });
    return false;
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

function isPrivateIP(hostname) {
  const privatePatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^0\./,
    /^\[::1\]$/,
    /^\[fc/i,
    /^\[fd/i,
    /^\[fe80:/i,
  ];
  return privatePatterns.some(p => p.test(hostname));
}

function isValidURL(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (isPrivateIP(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIP(req);
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }

  const { url } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Please provide a valid URL.' });
  }

  let targetURL = url.trim();
  if (!/^https?:\/\//i.test(targetURL)) {
    targetURL = 'https://' + targetURL;
  }

  if (!isValidURL(targetURL)) {
    return res.status(400).json({ error: 'Invalid URL. Only public http:// and https:// URLs are allowed.' });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const startTime = Date.now();

    const response = await fetch(targetURL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'DownloadHTML Bot/1.0 (+https://downloadhtml.com)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      redirect: 'follow',
    });

    clearTimeout(timeout);

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_RESPONSE_SIZE) {
      return res.status(413).json({ error: 'Response too large. Maximum size is 5MB.' });
    }

    const buffer = await response.arrayBuffer();
    const fetchTime = Date.now() - startTime;

    if (buffer.byteLength > MAX_RESPONSE_SIZE) {
      return res.status(413).json({ error: 'Response too large. Maximum size is 5MB.' });
    }

    const html = new TextDecoder('utf-8', { fatal: false }).decode(buffer);

    const headers = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return res.status(200).json({
      html,
      status: response.status,
      statusText: response.statusText,
      headers,
      size: buffer.byteLength,
      fetchTime,
      url: response.url,
    });

  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out after 10 seconds.' });
    }

    const message = err.code === 'ENOTFOUND'
      ? 'Could not resolve hostname. Check the URL and try again.'
      : err.code === 'ECONNREFUSED'
        ? 'Connection refused by the target server.'
        : 'Failed to fetch the URL. Make sure it\'s accessible and try again.';

    return res.status(502).json({ error: message, debug: { name: err.name, code: err.code, msg: err.message } });
  }
}
