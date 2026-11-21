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
  let p = packed;
  const a = parseInt(packed, 10);
  let c = parseInt(packed, 10);
  const k = packed.split("|");
  while (c--) {
    if (k[c]) {
      p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), k[c]);
    }
  }
  return p;
}

async function resolveEmbed(embedUrl, referer, headers) {
  let finalEmbed = embedUrl;
  try {
    const res = await fetch(embedUrl, { headers: { ...headers, Referer: referer } });
    let html = await res.text();

    // Unwrap tooniboy ?trembed= wrapper page
    if (html.includes("trembed") || embedUrl.includes("trembed=")) {
      const inner = html.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+|\/\/[^"']+)["']/i);
      if (inner) {
        let nextUrl = inner;
        if (nextUrl.startsWith("//")) nextUrl = "https:" + nextUrl;
        finalEmbed = nextUrl;
        const res2 = await fetch(nextUrl, { headers: { ...headers, Referer: embedUrl } });
        html = await res2.text();
      }
    }

    const combined = html + "\n" + unpackJS(html);
    const match = combined.match(/(https?:\/\/[^"'\s\\]+\.(?:m3u8|mp4)[^"'\s\\]*)/i);
    if (match) {
      return {
        url: match.replace(/\\\//g, "/"),
        referer: finalEmbed,
        isDirect: true
      };
    }
  } catch (_) {}

  // Fallback: return unwrapped embed URL if not still on tooniboy.xyz
  if (!finalEmbed.includes("tooniboy.xyz")) {
    return { url: finalEmbed, referer: referer, isDirect: false };
  }
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

      const iframeRegex = /<iframe[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi;
      let m;
      while ((m = iframeRegex.exec(pageHtml)) !== null) {
        let embedUrl = m.replace(/&amp;/g, "&");
        if (embedUrl.startsWith("//")) embedUrl = "https:" + embedUrl;
        if (embedUrl.startsWith("/")) embedUrl = BASE_URL + embedUrl;
        if (/youtube|facebook|google|ads|gravatar/i.test(embedUrl)) continue;
        if (seenEmbeds.has(embedUrl)) continue;
        seenEmbeds.add(embedUrl);

        const resolved = await resolveEmbed(embedUrl, pageUrl, headers);
        if (resolved) {
          let hostLabel = "Server " + (streams.length + 1);
          try {
            hostLabel = new URL(resolved.referer).hostname.replace("www.", "").split(".");
          } catch (_) {}

          streams.push({
            name: "Tooniboy (" + hostLabel + ")",
            title: title + (mediaType === "tv" ? " S" + s + "E" + e : "") + (resolved.isDirect ? " [Direct]" : " [Embed]") + "\n[Multi-Audio: Telugu / Hindi / Tamil / Eng]",
            url: resolved.url,
            quality: "HD",
            headers: {
              "Referer": resolved.referer,
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
