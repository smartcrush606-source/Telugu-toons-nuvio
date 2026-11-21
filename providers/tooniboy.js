var BASE_URL = "https://tooniboy." + "xyz";
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";

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
  if (!packed || !packed) return html;
  var p = packed;
  var a = parseInt(packed, 10);
  var c = parseInt(packed, 10);
  var k = packed.split("|");
  while (c--) {
    if (k[c]) {
      p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), k[c]);
    }
  }
  return p;
}

function extractLabels(html) {
  var labels = [];
  var btnRegex = /<a[^>]+href=["']#options-(\d+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  var m;
  while ((m = btnRegex.exec(html)) !== null) {
    var clean = m.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    labels[parseInt(m, 10)] = clean;
  }
  return labels;
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
        var labels = extractLabels(html);
        var regex = /<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
        var match;
        var embeds = [];

        while ((match = regex.exec(html)) !== null) {
          var u = String(match).replace(/&amp;/g, "&");
          if (u.indexOf("//") === 0) u = "https:" + u;
          if (u.indexOf("/") === 0) u = BASE_URL + u;
          if (!/youtube|facebook|google|ads|gravatar/i.test(u) && embeds.indexOf(u) === -1) {
            embeds.push(u);
          }
        }

        var tasks = embeds.slice(0, 6).map(function(embedUrl, idx) {
          var tabLabel = labels[idx] || ("Server " + (idx + 1));
          return fetch(embedUrl, { headers: { "User-Agent": headers["User-Agent"], "Referer": pageUrl } })
            .then(function(r) { return r.text(); })
            .then(function(h1) {
              var innerMatch = h1.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+|\/\/[^"']+)["']/i);
              if (innerMatch && innerMatch) {
                var nextUrl = innerMatch;
                if (nextUrl.indexOf("//") === 0) nextUrl = "https:" + nextUrl;
                return fetch(nextUrl, { headers: { "User-Agent": headers["User-Agent"], "Referer": embedUrl } })
                  .then(function(r2) { return r2.text(); })
                  .then(function(h2) { return { html: h2, ref: nextUrl }; });
              }
              return { html: h1, ref: embedUrl };
            })
            .then(function(obj) {
              var fullText = obj.html + "\n" + unpackJS(obj.html);
              var m3u8 = fullText.match(/(https?:\/\/[^"'\s\\]+\.(?:m3u8|mp4)[^"'\s\\]*)/i);
              var hostName = "";
              try {
                var parts = obj.ref.split("/");
                if (parts) hostName = parts.replace("www.", "");
              } catch (_) {}

              if (m3u8 && m3u8) {
                streams.push({
                  name: "Tooniboy • " + tabLabel,
                  title: title + " S" + s + "E" + e + " (" + hostName + ")\n[Check Audio Track for Telugu]",
                  url: m3u8.replace(/\\\//g, "/"),
                  quality: "HD",
                  headers: { "Referer": obj.ref, "User-Agent": headers["User-Agent"] }
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
