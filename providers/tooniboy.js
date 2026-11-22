
var BASE_URL = "https://tooniboy." + "xyz";
var TMDB_KEY = "f2999de87d4e2c1dcde9aa5f60721bf7";

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
      .then(function(d) {
        return d && d.meta ? d.meta.name : "";
      });
  }

  var tt = mediaType === "movie" ? "movie" : "tv";

  return fetch("https://api.themoviedb." + "org/3/" + tt + "/" +
    idStr + "?api_key=" + TMDB_KEY)
    .then(function(r) { return r.json(); })
    .then(function(d) {
      return d ? (d.name || d.title || "") : "";
    });
}

function unpack(html) {
  var m = html.match(/eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\('([^']+)',\s*(\d+),\s*(\d+),\s*'([^']+)'\.split\('\|'\)/);

  if (!m) return html;

  var p = at(m, 1);
  var a = parseInt(at(m, 2), 10);
  var c = parseInt(at(m, 3), 10);
  var k = at(m, 4).split("|");

  while (c--) {
    var word = at(k, c);
    if (word) {
      p = p.replace(new RegExp("\\b" + c.toString(a) + "\\b", "g"), word);
    }
  }

  return p;
}

function findStream(text) {
  try {
    var j = JSON.parse(text);
    if (j && j.videoSource) {
      return String(j.videoSource).replace(/\\\//g, "/");
    }
  } catch (_) {}

  var combined = text + "\n" + unpack(text);

  var vs = combined.match(/["']?(?:videoSource|file|hls2|hls4|hls3)["']?\s*:\s*["'](https?:\/\/[^"'\s\\]+)["']/i);

  if (vs && !/(?:scripts\.php|\.js|\.css|\.jpg|\.png|\.webp|\.vtt|\.srt)/i.test(at(vs, 1))) {
    return at(vs, 1).replace(/\\\//g, "/");
  }

  var std = combined.match(/(https?:\/\/[^"'\s\\]+\.(?:m3u8|mp4)[^"'\s\\]*)/i);

  if (std) return at(std, 1).replace(/\\\//g, "/");

  return "";
}

function checkEmbed(embedUrl, pageUrl, title, s, e, label, ua) {
  if (!embedUrl) return Promise.resolve(null);

  return fetch(embedUrl, {
    headers: {
      "User-Agent": ua,
      "Referer": pageUrl
    }
  })
    .then(function(r1) { return r1.text(); })
    .then(function(h1) {
      var inner = h1.match(/<iframe[^>]+src=["'](https?:\/\/[^"']+|\/\/[^"']+)["']/i);
      var targetUrl = inner ? at(inner, 1) : embedUrl;

      if (targetUrl.indexOf("//") === 0) {
        targetUrl = "https:" + targetUrl;
      }

      var fetchInner = inner
        ? fetch(targetUrl, {
            headers: {
              "User-Agent": ua,
              "Referer": embedUrl
            }
          }).then(function(r2) { return r2.text(); })
        : Promise.resolve(h1);

      return fetchInner.then(function(h2) {
        var origin = targetUrl.split("/").slice(0, 3).join("/");
        var direct = findStream(h2);

        if (direct) {
          return {
            name: "Tooniboy • " + label,
            title: title + " S" + s + "E" + e + " [Multi-Audio]",
            url: direct,
            quality: "HD",
            headers: {
              "Referer": targetUrl,
              "Origin": origin,
              "User-Agent": ua
            }
          };
        }

        var vid = "";
        var qMatch = targetUrl.match(/[?&](?:data|id|v)=([^&]+)/i);

        if (qMatch) {
          vid = at(qMatch, 1);
        } else {
          var cleanPath = at(targetUrl.split("?"), 0).replace(/\/+$/, "");
          var parts = cleanPath.split("/");
          vid = at(parts, parts.length - 1);
        }

        return fetch(origin + "/player/index.php?data=" +
          encodeURIComponent(vid) + "&do=getVideo", {
          method: "POST",
          headers: {
            "User-Agent": ua,
            "Referer": targetUrl,
            "Origin": origin,
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
          },
          body: "hash=" + encodeURIComponent(vid) +
            "&r=" + encodeURIComponent(embedUrl)
        })
          .then(function(r3) { return r3.text(); })
          .then(function(apiTxt) {
            var apiStream = findStream(apiTxt);
            if (!apiStream) return null;

            return {
              name: "Tooniboy • " + label,
              title: title + " S" + s + "E" + e + " [Multi-Audio]",
              url: apiStream,
              quality: "HD",
              headers: {
                "Referer": targetUrl,
                "Origin": origin,
                "User-Agent": ua
              }
            };
          });
      });
    })
    .catch(function() {
      return null;
    });
}

function debugEmbeds(embeds, pageUrl, info) {
  if (!embeds.length) {
    return [{
      name: "DEBUG: " + info,
      title: "No embed links found",
      url: pageUrl,
      quality: "DEBUG"
    }];
  }

  return embeds.map(function(u, i) {
    return {
      name: "DEBUG EMBED " + (i + 1),
      title: u,
      url: pageUrl,
      quality: "DEBUG"
    };
  });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36";

  var hdr = {
    "User-Agent": ua,
    "Referer": BASE_URL + "/"
  };

  return getTitle(tmdbId, mediaType).then(function(title) {
    if (!title) {
      return [{
        name: "DEBUG: Title lookup failed",
        title: "TMDB did not return a title",
        url: BASE_URL + "/",
        quality: "DEBUG"
      }];
    }

    var slug = slugify(title);
    var s = season || 1;
    var e = episode || 1;

    var pageUrl = mediaType === "movie"
      ? BASE_URL + "/movies/" + slug + "/"
      : BASE_URL + "/episode/" + slug + "-" + s + "x" + e + "/";

    return fetch(pageUrl, { headers: hdr })
      .then(function(r) {
        var status = r.status;

        return r.text().then(function(html) {
          var embeds = [];

          var trRegex = /(https?:\/\/tooniboy\.xyz\/\?trembed=\d+[^"'\s<>]*|\/\?trembed=\d+[^"'\s<>]*)/gi;
          var tm;

          while ((tm = trRegex.exec(html)) !== null) {
            var tu = at(tm, 1).replace(/&amp;/g, "&");
            if (tu.indexOf("/") === 0) tu = BASE_URL + tu;
            if (embeds.indexOf(tu) === -1) embeds.push(tu);
          }

          var regex = /(?:<iframe[^>]+(?:src|data-src)|data-url)=["']([^"']+)["']/gi;
          var m;

          while ((m = regex.exec(html)) !== null) {
            var u = at(m, 1).replace(/&amp;/g, "&");

            if (u.indexOf("//") === 0) u = "https:" + u;
            if (u.indexOf("/") === 0) u = BASE_URL + u;

            if (u && !/youtube|facebook|google|ads|gravatar/i.test(u) &&
                embeds.indexOf(u) === -1) {
              embeds.push(u);
            }
          }

          var info = "HTTP " + status +
            " | HTML " + html.length +
            " | Embeds " + embeds.length;

          if (embeds.length === 0) {
            return debugEmbeds([], pageUrl, info);
          }

          var results = [];
          var checks = [];

          for (var j = 0; j < embeds.length; j++) {
            (function(index) {
              checks.push(
                checkEmbed(
                  embeds[index],
                  pageUrl,
                  title,
                  s,
                  e,
                  "Server candidate " + (index + 1),
                  ua
                ).then(function(result) {
                  if (result) results.push(result);
                })
              );
            })(j);
          }

          return Promise.all(checks).then(function() {
            if (results.length > 0) return results;

            return debugEmbeds(embeds, pageUrl, info);
          });
        });
      });
  }).catch(function(err) {
    return [{
      name: "DEBUG ERROR",
      title: String(err).slice(0, 200),
      url: BASE_URL + "/",
      quality: "DEBUG"
    }];
  });
}

module.exports = {
  getStreams: getStreams
};
