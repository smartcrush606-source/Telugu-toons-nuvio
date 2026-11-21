const BASE_URL = "https://tooniboy.xyz";

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    const typePath = mediaType === "movie" ? "movie" : "series";
    const metaUrl = "https://v3-cinemeta." + "strem.io/meta/" + typePath + "/" + tmdbId + ".json";

    const metaRes = await fetch(metaUrl);
    const metaData = await metaRes.json();
    const title = metaData && metaData.meta ? metaData.meta.name : null;
    if (!title) return [];

    const headers = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
      "Referer": BASE_URL
    };

    const searchUrl = BASE_URL + "/?s=" + encodeURIComponent(title);
    const searchRes = await fetch(searchUrl, { headers });
    const html = await searchRes.text();

    const linkRegex = /<a[^>]+href="(https?:\/\/tooniboy\.xyz\/[^"]+)"[^>]*>([^<]{3,120})<\/a>/gi;
    const seen = new Set();
    const candidateUrls = [];

    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const url = m[1];
      const text = m[2].replace(/&#8211;|&amp;/g, "-").trim();
      if (
        seen.has(url) ||
        url.includes("/category/") ||
        url.includes("/tag/") ||
        url.includes("/author/") ||
        url === BASE_URL + "/"
      ) continue;
      seen.add(url);
      candidateUrls.push({ url, text });
      if (candidateUrls.length >= 5) break;
    }

    const streams = [];

    for (const item of candidateUrls) {
      const pageRes = await fetch(item.url, { headers });
      const pageHtml = await pageRes.text();

      let targetHtml = pageHtml;
      if (mediaType === "tv" && episode) {
        const epRegex = new RegExp('href="(https?:\\/\\/tooniboy\\.xyz\\/[^"]*(?:ep|episode)[^"]*0?' + episode + '[^"]*)"', "i");
        const epMatch = pageHtml.match(epRegex);
        if (epMatch) {
          const epRes = await fetch(epMatch[1], { headers });
          targetHtml = await epRes.text();
        }
      }

      const iframeMatches = [...targetHtml.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)];
      for (const frame of iframeMatches) {
        let embedUrl = frame[1];
        if (embedUrl.startsWith("//")) embedUrl = "https:" + embedUrl;
        if (/youtube|facebook|google|ads/i.test(embedUrl)) continue;

        try {
          const playerRes = await fetch(embedUrl, {
            headers: { ...headers, Referer: item.url }
          });
          const playerHtml = await playerRes.text();
          const streamMatch = playerHtml.match(/(https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*)/i);
          if (streamMatch) {
            streams.push({
              name: "Tooniboy Telugu",
              title: item.text + "\n[Telugu / Multi-Audio]",
              url: streamMatch[1],
              quality: item.text.includes("1080") ? "1080p" : item.text.includes("720") ? "720p" : "480p",
              headers: { Referer: embedUrl }
            });
          }
        } catch (_) {}
      }
    }

    return streams;
  } catch (e) {
    return [];
  }
}

module.exports = { getStreams };
