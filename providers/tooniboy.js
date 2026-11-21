var BASE_URL = "https://tooniboy." + "xyz";
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";

function at(arr, idx) {
  return arr && arr.length > idx ? arr.slice(idx, idx + 1).join("") : "";
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getTitle(tmdbId, mediaType) {
  var idStr = String(tmdbId);
  if (idStr.indexOf("tt") === 0) {
    var typePath = mediaType === "movie" ? "movie" : "series";
    return fetch("https://v3-cinemeta." + "strem.io/meta/" + typePath + "/" + idStr + ".json")
      .then(function(r) { return r.json(); })
      .then(function(d) { return d && d.meta ? d.meta.name : null; });
  }
  var tmdbType = mediaType === "movie" ? "movie" : "tv";
  var url = "https://api.themoviedb." + "org/3/" + tmdbType + "/" + idStr + "?api_key=" + TMDB_KEY;
  return fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(d) { return d ? (d.name || d.title || d.original_name || d.original_title) : null; });
}

function unpackJS(html) {
  var packed = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\('([^']+)',\s*(\d+),\s*(\d+),\s*'([^']+)'\.split\('\|'\)/);
  if (!packed) return html;
  var p = at(packed, 1);
  var a = parseInt(at(packed, 2), 10);
  var c = parseInt(at(packed, 3), 10);
  var k = at(packed, 4).split("|");
  while (c--) {
    if (at(k, c)) {
      p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), at(k, c));
    }
  }
  return p;
}

function findHlsUrl(text) {
  // 1. Match ravok.buzz or HLS CDN links (with or without .m3u8 extension)
  var ravok = text.match(/(https?:\/\/[a-z0-9.-]*ravok\.buzz[^"'\s\\]+)/i);
  if (ravok) return at(ravok, 1).replace(/\\\//g, "/");

  // 2. Match JW Player file:"..." or sources:[{"file":"..."}]
  var jwFile = text.match(/["']?file["']?\s*:\s*["'](https?:\/\/[^"'\s\\]+)["']/i);
  if (jwFile && !/\.(?:jpg|jpeg|png|webp|vtt|srt|js|css)/i.test(at(jwFile, 1))) {
    return at(jwFile, 1).replace(/\\\//g, "/");
  }

  // 3. Standard .m3u8 or .mp4 URL
  var std = text.match(/(https?:\/\/[^"'\s\\]+\.(?:m3u8|mp4)[^"'\s\\]*)/i);
  if (std) return at(std, 1).replace(/\\\//g, "/");

  return "";
}

function getStreams(tmdbId, mediaType, season, episode) {
  var headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    "Referer": BASE_URL + "/"
  };

  return getTitle(tmdbId, mediaType).then(function(title) {
    if (!title) return [];

    var slug = slugify(title);
    var s = season || 1;
    var e = episode || 1;
    var pageUrl = mediaType === "movie"
      ? BASE_URL + "/movies/" + slug + "/"
      : BASE_URL + "/episode/" + slug + "-" + s + "x" + e + "/";

    return fetch(pageUrl, { headers: headers })
      .then(function(res) { return res.text(); })
      .then(function(html) {
        var streams = [];
        var regex = /<iframe[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/gi;
        var match;
        var embeds = [];

        while ((match = regex.exec(html)) !== null) {
          var u = at(match, 1).replace(/&amp;/g, "&");
          if (u.indexOf("//") === 0) u = "https:" + u;
          if (u.indexOf("/") === 0) u = BASE_URL + u;
          if (u && !/youtube|facebook|google|ads|gravatar/i.test(u) && embeds.indexOf(u) === -1) {
            embeds.push(u);
          }
        }

        var tasks = embeds.slice(0, 5).map(function(embedUrl, idx) {
          return fetch(embedUrl, { headers: { "User-Agent": headers["User-Agent"], "Referer": pageUrl } })
            .then(function(r) { return r.text(); })
            .then(function(h1) {
              var innerMatch = h1.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+|\/\/[^"']+)["']/i);
              if (innerMatch) {
                var nextUrl = at(innerMatch, 1);
                if (nextUrl.indexOf("//") === 0) nextUrl = "https:" + nextUrl;
                return fetch(nextUrl, { headers: { "User-Agent": headers["User-Agent"], "Referer": embedUrl } })
                  .then(function(r2) { return r2.text(); })
                  .then(function(h2) { return { html: h2, ref: nextUrl }; });
              }
              return { html: h1, ref: embedUrl };
            })
            .then(function(obj) {
              var fullText = obj.html + "\n" + unpackJS(obj.html);
              var streamUrl = findHlsUrl(fullText);
              var refOrigin = obj.ref.split("/").slice(0, 3).join("/") + "/";

              if (streamUrl) {
                streams.push({
                  name: "Tooniboy • Server " + (idx + 1) + " (Multi-Audio)",
                  title: title + " S" + s + "E" + e + " [JW HLS]\n[Tap Audio Icon -> Select Telugu]",
                  url: streamUrl,
                  quality: "HD",
                  headers: {
                    "Referer": refOrigin,
                    "Origin": refOrigin.slice(0, -1),
                    "User-Agent": headers["User-Agent"]
                  }
                });
              }
            })
            .catch(function() {});
        });

        return Promise.all(tasks).then(function() { return streams; });
      });
  }).catch(function() { return []; });
}

module.exports = { getStreams: getStreams };
