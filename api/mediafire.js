function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(data, null, 2));
}

function decodeHtml(value) {
  if (!value) return "";
  return String(value)
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function isMediaFire(link) {
  try {
    const u = new URL(link);
    return /(^|\.)mediafire\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

function fixMediafireUrl(link) {
  try {
    const u = new URL(link);
    // support /view/ style links
    u.pathname = u.pathname.replace("/view/", "/file/");
    return u.toString();
  } catch {
    return link;
  }
}

function getFileId(link) {
  try {
    const parts = new URL(link).pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("file");
    return idx >= 0 && parts[idx + 1] ? parts[idx + 1] : "";
  } catch {
    return "";
  }
}

function cleanDirect(url) {
  url = decodeHtml(url || "").trim();

  if (!url || url === "#" || url.toLowerCase().startsWith("javascript:")) {
    return "";
  }

  if (url.startsWith("//")) return "https:" + url;

  return url;
}

function pickDirectLink(html) {
  const h = decodeHtml(html);

  // Original CYCNO logic equivalent:
  // soup.find("a", {"class": "input popsok"}).get("href")
  const originalClassMatch = h.match(/<a\b(?=[^>]*class=["'][^"']*\binput\b[^"']*\bpopsok\b[^"']*["'])[^>]*href=["']([^"']+)["'][^>]*>/i);
  let direct = cleanDirect(originalClassMatch && originalClassMatch[1]);
  if (direct) return direct;

  // More MediaFire fallback patterns, but ignore href="#"
  const patterns = [
    /<a\b(?=[^>]*id=["']downloadButton["'])[^>]*href=["']([^"']+)["'][^>]*>/i,
    /href=["'](https?:\/\/download\d+\.mediafire\.com\/[^"']+)["']/i,
    /href=["'](https?:\/\/download[^"']*mediafire[^"']+)["']/i,
    /(https?:\/\/download\d+\.mediafire\.com\/[^\s"'<>\\]+)/i
  ];

  for (const p of patterns) {
    const m = h.match(p);
    direct = cleanDirect(m && m[1]);
    if (direct) return direct;
  }

  return "";
}

function pickName(html) {
  const h = decodeHtml(html);

  const dlLabel = h.match(/<div\b[^>]*class=["'][^"']*\bdl-btn-label\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (dlLabel && dlLabel[1]) {
    return dlLabel[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  }

  const og = h.match(/<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  if (og && og[1]) return og[1].trim();

  const title = h.match(/<title>([\s\S]*?)<\/title>/i);
  if (title && title[1]) {
    return title[1].replace(/\s*-\s*MediaFire\s*$/i, "").replace(/\s+/g, " ").trim();
  }

  return "Unknown";
}

function pickSize(html) {
  const h = decodeHtml(html);

  // From original: text inside a.input.popsok often contains "(834.75KB)"
  const buttonText = h.match(/<a\b(?=[^>]*class=["'][^"']*\binput\b[^"']*\bpopsok\b[^"']*["'])[^>]*>([\s\S]*?)<\/a>/i);
  if (buttonText && buttonText[1]) {
    const text = buttonText[1].replace(/<[^>]+>/g, " ");
    const inParen = text.match(/\(([^()]+(?:KB|MB|GB|TB))\)/i);
    if (inParen && inParen[1]) return inParen[1].replace(/\s+/g, "").trim();
  }

  const anySize = h.match(/(\d+(?:\.\d+)?\s?(?:KB|MB|GB|TB))/i);
  return anySize && anySize[1] ? anySize[1].replace(/\s+/g, "").trim() : "Unknown";
}

function pickDateTime(html) {
  const h = decodeHtml(html);
  const date = h.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/);
  const time = h.match(/(\d{2}:\d{2}:\d{2})/);
  return {
    time: time ? time[1] : "Unknown",
    date: date ? date[1] : "Unknown"
  };
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
    return sendJson(res, 405, { status: "false", message: "Use GET only." });
  }

  const original = typeof req.query.link === "string" ? req.query.link.trim() : "";

  if (!original) {
    return sendJson(res, 400, {
      status: "false",
      message: "Missing link",
      example: "/api/mediafire?link=https://www.mediafire.com/file/xxxx/file.zip/view"
    });
  }

  if (!isMediaFire(original)) {
    return sendJson(res, 400, {
      status: "false",
      message: "MediaFire link only."
    });
  }

  const fixedUrl = fixMediafireUrl(original);

  try {
    const r = await fetch(fixedUrl, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    const html = await r.text();
    const direct = pickDirectLink(html);

    if (!direct) {
      return sendJson(res, 404, {
        status: "false",
        message: "Direct download link not found. The file may be unavailable, private, blocked, or MediaFire changed its page.",
        original: original
      });
    }

    return sendJson(res, 200, {
      status: "true",
      data: {
        file: {
          url: {
            directDownload: direct,
            original: original
          },
          metadata: {
            id: getFileId(original),
            name: pickName(html),
            size: {
              readable: pickSize(html)
            },
            DateAndTime: pickDateTime(html)
          }
        }
      }
    });
  } catch (e) {
    return sendJson(res, 500, {
      status: "false",
      message: "Server error",
      error: e.message
    });
  }
};
