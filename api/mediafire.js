function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(data, null, 2));
}

function isValidMediaFireUrl(link) {
  try {
    const url = new URL(link);
    return /(^|\.)mediafire\.com$/i.test(url.hostname);
  } catch (e) {
    return false;
  }
}

function decodeHtml(value) {
  if (!value) return "";
  return value
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function pickDirectLink(html) {
  const decoded = decodeHtml(html);

  const patterns = [
    /id=["']downloadButton["'][\s\S]*?href=["']([^"']+)["']/i,
    /href=["'](https?:\/\/download[^"']*?\.mediafire\.com\/[^"']+)["']/i,
    /(https?:\/\/download\d+\.mediafire\.com\/[^\s"'<>\\]+)/i,
    /(https?:\/\/download[^"']+mediafire[^"']+)/i
  ];

  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match && match[1]) return decodeHtml(match[1]).trim();
  }

  return "";
}

function pickFileName(html) {
  const decoded = decodeHtml(html);

  const ogTitle = decoded.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogTitle && ogTitle[1]) return ogTitle[1].trim();

  const title = decoded.match(/<title>([\s\S]*?)<\/title>/i);
  if (title && title[1]) {
    return title[1]
      .replace(/\s*-\s*MediaFire\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "Unknown";
}

function pickFileSize(html) {
  const decoded = decodeHtml(html);
  const sizeMatch = decoded.match(/<li>\s*File size:\s*<span>\s*([^<]+)\s*<\/span>/i)
    || decoded.match(/File size:[\s\S]{0,80}?<span[^>]*>\s*([^<]+)\s*<\/span>/i)
    || decoded.match(/(\d+(?:\.\d+)?\s?(?:KB|MB|GB|TB))/i);

  return sizeMatch && sizeMatch[1] ? sizeMatch[1].trim() : "Unknown";
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.end();
    return;
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, {
      status: "false",
      message: "Method not allowed. Use GET."
    });
  }

  const link = typeof req.query.link === "string" ? req.query.link.trim() : "";

  if (!link) {
    return sendJson(res, 400, {
      status: "false",
      message: "Missing required query: link",
      example: "/api/mediafire?link=https://www.mediafire.com/file/xxxx/file.zip/view"
    });
  }

  if (!isValidMediaFireUrl(link)) {
    return sendJson(res, 400, {
      status: "false",
      message: "Invalid link. MediaFire link only."
    });
  }

  try {
    const response = await fetch(link, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    if (!response.ok) {
      return sendJson(res, 502, {
        status: "false",
        message: "Failed to fetch MediaFire page.",
        httpStatus: response.status
      });
    }

    const html = await response.text();
    const directDownload = pickDirectLink(html);

    if (!directDownload) {
      return sendJson(res, 404, {
        status: "false",
        message: "Direct download link not found. MediaFire may have changed its page or the file link is unavailable.",
        original: link
      });
    }

    return sendJson(res, 200, {
      status: "true",
      data: {
        file: {
          url: {
            directDownload: directDownload,
            original: link
          },
          metadata: {
            name: pickFileName(html),
            size: {
              readable: pickFileSize(html)
            }
          }
        }
      }
    });
  } catch (error) {
    return sendJson(res, 500, {
      status: "false",
      message: "Server error while generating direct link.",
      error: error.message
    });
  }
};
