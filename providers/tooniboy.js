var BASE_URL = "https://tooniboy." + "xyz";
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";

function at(arr, idx) {
  return arr && arr.length > idx ? arr.slice(idx, idx + 1).join("") : "";
}

function slugify(text) {
  return String(text)
    .replace(/\(\d{4}\)/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getTitle(tmdbId, mediaType) {
  var idStr = String(tmdbId);
  if (idStr.indexOf("tt") === 0) {
    var tp = mediaType === "movie" ? "movie" : "series";
    return fetch("https://v3-cinemeta." + "strem.io/meta/" + tp + "/" + idStr + ".json")
      .then(function(r) { return r.json(); })
      .then(function(d) { return d && d.meta ? d.meta.name : ""; });
  }
  var tt = mediaType === "movie" ? "movie" : "tv";
  return fetch("https://api.themoviedb." + "org/3/" + tt + "/" + idStr + "?api_key=" + TMDB_KEY)
    .then(function(r) { return r.json(); })
    .then(function(d) { return d ? (d.name || d.title || "") : ""; });
}

function findStream(text) {
  var r1 = text.match(/(https?:\/\/[a-z0-9.-]*ravok\.buzz[^"'\s\\]+)/i);
  if (r1) return at(r1, 1).replace(/\\\//g, "/");
  var r2 = text.match(/["']?(?:videoSource|file)["']?\s*:\s*["'](https?:\/\/[^"'\s\\]+)["']/i);
  if (r2 && !/\.(?:jpg|png|webp|vtt|srt|js|css)/i.test(at(r2, 1))) return at(r2, 1).replace(/\\\//g, "/");
  var r3 = text.match(/(https?:\/\/[^"'\s\\]+\.(?:m3u8|mp4)[^"'\s\\]*)/i);
  if (r3) return at(r3, 1).replace(/\\\//g, "/");
  return "";
}

function getStreams(tmdbId, mediaType, season, episode) {
  var ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36";
  var hdr = { "User-Agent": ua, "Referer": BASE_URL + "/" };

  return getTitle(tmdbId, mediaType).then(function(title) {
    if (!title) return [];
    var slug = slugify(title);
    var s = season || 1;
    var e = episode || 1;
    var pageUrl = mediaType === "movie"
      ? BASE_URL + "/movies/" + slug + "/"
      : BASE_URL + "/episode/" + slug + "-" + s + "x" + e + "/";

    return fetch(pageUrl, { headers: hdr })
      .then(function(r) { return r.text(); })
      .then(function(html) {
        var regex = /<iframe[^>]+(?:src|data-src)=["']([^"']+)["']/gi;
        var m;
        var embeds = [];
        while ((m = regex.exec(html)) !== null) {
          var u = at(m, 1).replace(/&amp;/g, "&");
          if (u.indexOf("//") === 0) u = "https:" + u;
          if (u.indexOf("/") === 0) u = BASE_URL + u;
          if (u && !/youtube|facebook|google|ads|gravatar/i.test(u) && embeds.indexOf(u) === -1) {
            embeds.push(u);
          }
        }

        if (embeds.length === 0) {
          return [{ name: "Tooniboy Debug", title: pageUrl + " (0 embeds)", url: pageUrl, quality: "INFO" }];
        }

        var firstEmbed = at(embeds, 0);
        return fetch(firstEmbed, { headers: { "User-Agent": ua, "Referer": pageUrl } })
          .then(function(r1) { return r1.text(); })
          .then(function(h1) {
            var inner = h1.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+|\/\/[^"']+)["']/i);
            var targetUrl = inner ? at(inner, 1) : firstEmbed;
            if (targetUrl.indexOf("//") === 0) targetUrl = "https:" + targetUrl;

            var fetchInner = inner
              ? fetch(targetUrl, { headers: { "User-Agent": ua, "Referer": firstEmbed } }).then(function(r2) { return r2.text(); })
              : Promise.resolve(h1);

            return fetchInner.then(function(h2) {
              var direct = findStream(h2);
              var origin = targetUrl.split("/").slice(0, 3).join("/");
              if (direct) {
                return [{
                  name: "Tooniboy • Multi-Audio",
                  title: title + " S" + s + "E" + e + "\n[Tap Audio Icon -> Telugu]",
                  url: direct,
                  quality: "HD",
                  headers: { "Referer": origin + "/", "Origin": origin, "User-Agent": ua }
                }];
              }
              var vid = at(at(targetUrl.split("/"), targetUrl.split("/").length - 1).split("?"), 0);
              return fetch(origin + "/player/index.php?data=" + encodeURIComponent(vid) + "&do=getVideo", {
                method: "POST",
                headers: {
                  "User-Agent": ua,
                  "Referer": targetUrl,
                  "Origin": origin,
                  "X-Requested-With": "XMLHttpRequest",
                  "Content-Type": "application/x-www-form-urlencoded"
                },
                body: "hash=" + encodeURIComponent(vid) + "&r=" + encodeURIComponent(BASE_URL + "/")
              })
                .then(function(r3) { return r3.text(); })
                .then(function(apiTxt) {
                  var apiStream = findStream(apiTxt);
                  if (apiStream) {
                    return [{
                      name: "Tooniboy • Multi-Audio",
                      title: title + " S" + s + "E" + e + "\n[Tap Audio Icon -> Telugu]",
                      url: apiStream,
                      quality: "HD",
                      headers: { "Referer": origin + "/", "Origin": origin, "User-Agent": ua }
                    }];
                  }
                  return [{
                    name: "Tooniboy Host Info",
                    title: "Host: " + targetUrl,
                    url: targetUrl,
                    quality: "DEBUG"
                  }];
                });
            });
          });
      });
  }).catch(function(err) {
    return [{ name: "Tooniboy Err", title: String(err), url: BASE_URL, quality: "ERR" }];
  });
}

module.exports = { getStreams: getStreams };
