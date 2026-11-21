var BASE_URL = "https://tooniboy." + "xyz";
var TMDB_KEY = "439c478a771f35c05022f9feabcca01c";

function at(arr, idx) {
  return arr && arr.length > idx ? arr.slice(idx, idx + 1).join("") : "";
}

function itemAt(arr, idx) {
  return arr && arr.length > idx ? arr.slice(idx, idx + 1).pop() : null;
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

function findStream(text) {
  try {
    var j = JSON.parse(text);
    if (j && j.videoSource) return String(j.videoSource).replace(/\\\//g, "/");
    if (j && j.videoSources && j.videoSources.length > 0) {
      var first = itemAt(j.videoSources, 0);
      if (first && first.file) return String(first.file).replace(/\\\//g, "/");
    }
  } catch (_) {}

  var unpacked = unpackJS(text);
  var combined = text + "\n" + unpacked;

  var vs = combined.match(/["']?(?:videoSource|file|src)["']?\s*:\s*["'](https?:\/\/[^"'\s\\]+)["']/i);
  if (vs && !/(?:scripts\.php|\.js|\.css|\.jpg|\.png|\.webp|\.vtt|\.srt)/i.test(at(vs, 1))) {
    return at(vs, 1).replace(/\\\//g, "/");
  }
  var std = combined.match(/(https?:\/\/[^"'\s\\]+\.(?:m3u8|mp4)[^"'\s\\]*)/i);
  if (std) return at(std, 1).replace(/\\\//g, "/");
  return "";
}

function resolveOneEmbed(embedUrl, pageUrl, title, s, e, idx, ua) {
  return fetch(embedUrl, { headers: { "User-Agent": ua, "Referer": pageUrl } })
    .then(function(r1) { return r1.text(); })
    .then(function(h1) {
      var inner = h1.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+|\/\/[^"']+)["']/i);
      var targetUrl = inner ? at(inner, 1) : embedUrl;
      if (targetUrl.indexOf("//") === 0) targetUrl = "https:" + targetUrl;

      var fetchInner = inner
        ? fetch(targetUrl, { headers: { "User-Agent": ua, "Referer": embedUrl } }).then(function(r2) { return r2.text(); })
        : Promise.resolve(h1);

      return fetchInner.then(function(h2) {
        var origin = targetUrl.split("/").slice(0, 3).join("/");
        var direct = findStream(h2);
        if (direct) {
          return {
            ok: true,
            item: {
              name: "Tooniboy • Server " + (idx + 1) + " (Multi-Audio)",
              title: title + " S" + s + "E" + e + " [Telugu / Tamil / Hindi]",
              url: direct,
              type: "hls",
              quality: "HD",
              headers: { "Referer": targetUrl, "Origin": origin, "User-Agent": ua }
            }
          };
        }

        var vid = "";
        var qMatch = targetUrl.match(/[?&](?:data|id|v)=([^&]+)/i);
        if (qMatch) {
          vid = at(qMatch, 1);
        } else {
          var cleanPath = at(targetUrl.split("?"), 0).replace(/\/+$/, "");
          vid = at(cleanPath.split("/"), cleanPath.split("/").length - 1);
        }

        return fetch(origin + "/player/index.php?data=" + encodeURIComponent(vid) + "&do=getVideo", {
          method: "POST",
          headers: {
            "User-Agent": ua,
            "Referer": targetUrl,
            "Origin": origin,
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
          },
          body: "hash=" + encodeURIComponent(vid) + "&r=" + encodeURIComponent(embedUrl)
        })
          .then(function(r3) { return r3.text(); })
          .then(function(apiTxt) {
            var apiStream = findStream(apiTxt);
            if (apiStream) {
              return {
                ok: true,
                item: {
                  name: "Tooniboy • Server " + (idx + 1) + " (Multi-Audio)",
                  title: title + " S" + s + "E" + e + " [Telugu / Tamil / Hindi]",
                  url: apiStream,
                  type: "hls",
                  quality: "HD",
                  headers: { "Referer": targetUrl, "Origin": origin, "User-Agent": ua }
                }
              };
            }
            return {
              ok: false,
              item: {
                name: "Server " + (idx + 1) + " Host",
                title: targetUrl,
                url: targetUrl,
                quality: "INFO"
              }
            };
          });
      });
    })
    .catch(function() { return null; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
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
          return [{ name: "Tooniboy Page", title: pageUrl + " (0 embeds)", url: pageUrl, quality: "INFO" }];
        }

        var tasks = embeds.slice(0, 4).map(function(embedUrl, idx) {
          return resolveOneEmbed(embedUrl, pageUrl, title, s, e, idx, ua);
        });

        return Promise.all(tasks).then(function(results) {
          var valid = [];
          var debugs = [];
          for (var i = 0; i < results.length; i++) {
            var r = itemAt(results, i);
            if (r && r.ok) valid.push(r.item);
            else if (r && !r.ok) debugs.push(r.item);
          }
          return valid.length > 0 ? valid : debugs;
        });
      });
  }).catch(function() { return []; });
}

module.exports = { getStreams: getStreams };
