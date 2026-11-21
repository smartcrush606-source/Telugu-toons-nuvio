const BASE_URL = "https://tooniboy." + "xyz";
const TMDB_KEY = "439c478a771f35c05022f9feabcca01c";

function slugify(text) {
  return String(text)
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

function unpackJS(html) {
  const packed = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\('([^']+)',\s*(\d+),\s*(\d+),\s*'([^']+)'\.split\('\|'\)/);
  if (!packed) return html;
  let p = packed[1];
  const a = parseInt(packed[2], 10);
  let c = parseInt(packed[3], 10);
  const k = packed[4].split("|");
  while (c--) {
    if (k[c]) {
      p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), k[c]);
    }
  }
  return p;
}

async function extractMediaUrl(embedUrl, referer, headers) {
  try {
    const res = await fetch(embedUrl, { headers: { ...headers, Referer: referer } });
    let html = await res.text();

    // If tooniboy ?trembed= wrapper page, extract inner iframe src first
    if (html.includes("trembed") || embedUrl.includes("trembed=")) {
      const inner = html.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+|\/\/[^"']+)["']/i);
      if (inner) {
        let nextUrl = inner[1];
        if (nextUrl.startsWith("//")) nextUrl = "https:" + nextUrl;
        const res2 = await fetch(nextUrl, { headers: { ...headers, Referer: embedUrl } });
        html = await res2.text();
        embedUrl = nextUrl;
      }
    }

    const unpacked = unpackJS(html);
    const combined = html + "\n" + unpacked;

    const match = combined.match(/(https?:\/\/[^"'\s\\]+\.(?:m3u8|mp4)[^"'\s\\]*)/i);
    if (match) {
      return {
        url: match[1].replace(/\\\//g, "/"),
        referer: embedUrl
      };
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
    const s = season || 1;
    const e = episode || 1;

    const candidatePages = mediaType === "movie"
      ? [BASE_URL + "/movies/" + slug + "/", BASE_URL + "/" + slug + "/"]
      : [
          BASE_URL + "/episode/" + slug + "-" + s + "x" + e + "/",
          BASE_URL + "/episode/" + slug + "-classic-" + s + "x" + e + "/"
        ];

    const streams = [];
    const seenEmbeds = new Set();

    for (const pageUrl of candidatePages) {
      const pageRes = await fetch(pageUrl, { headers });
      if (!pageRes.ok) continue;
      const pageHtml = await pageRes.text();

      // Match Torofilm ?trembed= iframes + standard player iframes
      const iframeRegex = /<iframe[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi;
      let m;
      while ((m = iframeRegex.exec(pageHtml)) !== null) {
        let embedUrl = m[1].replace(/&amp;/g, "&");
        if (embedUrl.startsWith("//")) embedUrl = "https:" + embedUrl;
        if (embedUrl.startsWith("/")) embedUrl = BASE_URL + embedUrl;
        if (/youtube|facebook|google|ads|gravatar/i.test(embedUrl)) continue;
        if (seenEmbeds.has(embedUrl)) continue;
        seenEmbeds.add(embedUrl);

        const extracted = await extractMediaUrl(embedUrl, pageUrl, headers);
        if (extracted) {
          let label = "Server " + (streams.length + 1);
          try {
            const host = new URL(extracted.referer).hostname.replace("www.", "");
            if (!host.includes("tooniboy")) label = host.split(".")[0];
          } catch (_) {}

          streams.push({
            name: "Tooniboy (" + label + ")",
            title: title + (mediaType === "tv" ? " S" + s + "E" + e : "") + "\n[Multi-Audio: Telugu / Hindi / Tamil / Eng]",
            url: extracted.url,
            quality: "HD",
            headers: {
              "Referer": extracted.referer,
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
