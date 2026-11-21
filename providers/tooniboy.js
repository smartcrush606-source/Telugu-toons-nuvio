const BASE_URL = "https://tooniboy." + "xyz";
const TMDB_KEY = "439c478a771f35c05022f9feabcca01c";

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function resolveTitle(tmdbId, mediaType) {
  const idStr = String(tmdbId);
  if (idStr.startsWith("tt")) {
    const typePath = mediaType === "movie" ? "movie" : "series";
    const res = await fetch("https://v3-cinemeta." + "strem.io/meta/" + typePath + "/" + idStr + ".json");
    const data = await res.json();
    return data && data.meta ? data.meta.name : null;
  }
  const tmdbType = mediaType === "movie" ? "movie" : "tv";
  const url = "https://api.themoviedb." + "org/3/" + tmdbType + "/" + idStr + "?api_key=" + TMDB_KEY;
  const res = await fetch(url);
  const data = await res.json();
  return data ? (data.name || data.title || data.original_name || data.original_title) : null;
}

async function extractVideoFromEmbed(embedUrl, referer, headers) {
  try {
    const res = await fetch(embedUrl, { headers: { ...headers, Referer: referer } });
    const html = await res.text();

    // 1. Direct m3u8 or mp4 URL inside player HTML/JS
    const direct = html.match(/(https?:\/\/[^"'\s\\]+\.(?:m3u8|mp4)[^"'\s\\]*)/i);
    if (direct) return direct.replace(/\\\//g, "/");

    // 2. Packed JS (eval(function(p,a,c,k,e,d))) used by Ruby / Streamwish / Vidhide / Moly
    const packed = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\('([^']+)',\s*(\d+),\s*(\d+),\s*'([^']+)'\.split\('\|'\)/);
    if (packed) {
      let p = packed;
      const a = parseInt(packed, 10);
      let c = parseInt(packed, 10);
      const k = packed.split("|");
      while (c--) {
        if (k[c]) {
          p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), k[c]);
        }
      }
      const unpackedUrl = p.match(/(https?:\/\/[^"'\s\\]+\.(?:m3u8|mp4)[^"'\s\\]*)/i);
      if (unpackedUrl) return unpackedUrl.replace(/\\\//g, "/");
    }
  } catch (_) {}
  return null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const title = await resolveTitle(tmdbId, mediaType);
    if (!title) return [];

    const headers = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
      "Referer": BASE_URL + "/"
    };

    const slug = slugify(title);
    const candidatePages = [];

    if (mediaType === "movie") {
      candidatePages.push(BASE_URL + "/movies/" + slug + "/");
      candidatePages.push(BASE_URL + "/" + slug + "/");
    } else {
      const s = season || 1;
      const e = episode || 1;
      candidatePages.push(BASE_URL + "/episode/" + slug + "-" + s + "x" + e + "/");
      candidatePages.push(BASE_URL + "/episode/" + slug + "-classic-" + s + "x" + e + "/");
    }

    // Fallback search on tooniboy.xyz if direct slug didn't match
    const searchRes = await fetch(BASE_URL + "/?s=" + encodeURIComponent(title), { headers });
    const searchHtml = await searchRes.text();
    const s = season || 1;
    const e = episode || 1;

    if (mediaType !== "movie") {
      const epRegex = new RegExp('href="(https?:\\/\\/tooniboy\\.xyz\\/episode\\/[^"]*-' + s + "x" + e + '\\/?)"', "gi");
      for (const m of searchHtml.matchAll(epRegex)) {
        if (!candidatePages.includes(m)) candidatePages.push(m);
      }
    }

    const streams = [];
    const triedEmbeds = new Set();

    for (const pageUrl of candidatePages.slice(0, 3)) {
      const pageRes = await fetch(pageUrl, { headers });
      if (!pageRes.ok) continue;
      const pageHtml = await pageRes.text();

      // Grab all player iframes + WordPress DooPlay / Torofilm data-url / embed links
      const embedRegex = /(?:<iframe[^>]+src=|data-url=|data-src=)["'](https?:\/\/[^"']+|\/\/[^"']+)["']/gi;
      for (const match of pageHtml.matchAll(embedRegex)) {
        let embedUrl = match;
        if (embedUrl.startsWith("//")) embedUrl = "https:" + embedUrl;
        if (/youtube|facebook|google|gravatar|tooniboy\.xyz\/wp-/i.test(embedUrl)) continue;
        if (triedEmbeds.has(embedUrl)) continue;
        triedEmbeds.add(embedUrl);

        const videoUrl = await extractVideoFromEmbed(embedUrl, pageUrl, headers);
        if (videoUrl) {
          let hostName = "Server";
          try { hostName = new URL(embedUrl).hostname.replace("www.", "").split("."); } catch (_) {}

          streams.push({
            name: "Tooniboy (" + hostName + ")",
            title: title + (mediaType === "tv" ? " S" + s + "E" + e : "") + "\n[Multi-Audio: Telugu / Hindi / Tamil / Eng]",
            url: videoUrl,
            quality: videoUrl.includes("1080") ? "1080p" : videoUrl.includes("720") ? "720p" : "HD",
            headers: {
              "Referer": embedUrl,
              "User-Agent": headers["User-Agent"]
            }
          });
        }
      }
      if (streams.length > 0) break;
    }

    return streams;
  } catch (err) {
    return [];
  }
}

module.exports = { getStreams };
