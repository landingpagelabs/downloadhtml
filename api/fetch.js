import https from 'https';
import http from 'http';

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

function fetchPage(targetURL) {
  return new Promise((resolve, reject) => {
    const parsedURL = new URL(targetURL);
    const client = parsedURL.protocol === 'https:' ? https : http;
    const startTime = Date.now();

    const request = client.get(targetURL, {
      headers: {
        'User-Agent': 'DownloadHTML Bot/1.0 (+https://downloadhtml.com)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      timeout: FETCH_TIMEOUT,
      rejectUnauthorized: false,
    }, (response) => {
      // Follow redirects (up to 5)
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        const redirectURL = new URL(response.headers.location, targetURL).href;
        if (!isValidURL(redirectURL)) {
          return reject(new Error('Redirect to invalid URL'));
        }
        return fetchPage(redirectURL).then(resolve).catch(reject);
      }

      const chunks = [];
      let totalSize = 0;

      response.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_RESPONSE_SIZE) {
          request.destroy();
          reject(new Error('RESPONSE_TOO_LARGE'));
        }
        chunks.push(chunk);
      });

      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const fetchTime = Date.now() - startTime;
        const headers = {};
        const rawHeaders = response.rawHeaders;
        for (let i = 0; i < rawHeaders.length; i += 2) {
          headers[rawHeaders[i].toLowerCase()] = rawHeaders[i + 1];
        }

        resolve({
          html: buffer.toString('utf-8'),
          status: response.statusCode,
          statusText: response.statusMessage,
          headers,
          size: buffer.length,
          fetchTime,
          url: targetURL,
        });
      });

      response.on('error', reject);
    });

    request.on('timeout', () => {
      request.destroy();
      reject(new Error('TIMEOUT'));
    });

    request.on('error', reject);
  });
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
    const data = await fetchPage(targetURL);
    return res.status(200).json(data);

  } catch (err) {
    if (err.message === 'TIMEOUT') {
      return res.status(504).json({ error: 'Request timed out after 10 seconds.' });
    }

    if (err.message === 'RESPONSE_TOO_LARGE') {
      return res.status(413).json({ error: 'Response too large. Maximum size is 5MB.' });
    }

    const message = err.code === 'ENOTFOUND'
      ? 'Could not resolve hostname. Check the URL and try again.'
      : err.code === 'ECONNREFUSED'
        ? 'Connection refused by the target server.'
        : 'Failed to fetch the URL. Make sure it\'s accessible and try again.';

    return res.status(502).json({ error: message });
  }
}
