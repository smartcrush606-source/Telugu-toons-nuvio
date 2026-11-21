const BASE_URL = "https://toonworld4all." + "me";

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

    const postRegex = /<h2[^>]*class="entry-title"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    const posts = [...html.matchAll(postRegex)];
    const streams = [];

    for (const post of posts.slice(0, 4)) {
      const postUrl = post[1];
      const postTitle = post[2].replace(/&#8211;|&amp;/g, "-").trim();

      if (mediaType === "tv" && season) {
        const sPad = String(season).padStart(2, "0");
        if (!new RegExp("(season\\s*0?" + season + "|s" + sPad + ")", "i").test(postTitle)) continue;
      }

      const pageRes = await fetch(postUrl, { headers });
      const pageHtml = await pageRes.text();

      const hostRegex = /href="(https?:\/\/(?:archive\.org|filemoon\.[^"]+|streamtape\.[^"]+|vidhide[^"]+|dood[^"]+|uqload[^"]+|streamwish[^"]+)[^"]+)"/gi;
      const hostMatches = [...pageHtml.matchAll(hostRegex)];

      for (const h of hostMatches) {
        const hostUrl = h[1];
        try {
          const hostRes = await fetch(hostUrl, {
            headers: { ...headers, Referer: postUrl }
          });
          const hostHtml = await hostRes.text();
          const mediaMatch = hostHtml.match(/(https?:\/\/[^"'\s]+\.(?:m3u8|mp4|mkv)[^"'\s]*)/i);
          if (mediaMatch) {
            streams.push({
              name: "ToonWorld4All Telugu",
              title: postTitle + "\n[Multi-Audio: Telugu / Hindi / Tamil / Eng]",
              url: mediaMatch[1],
              quality: postTitle.includes("1080") ? "1080p" : postTitle.includes("720") ? "720p" : "480p",
              headers: { Referer: hostUrl }
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
