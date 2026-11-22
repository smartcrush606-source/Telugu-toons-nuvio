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
  try {
    var j = JSON.parse(text);
    if (j && j.videoSource) return String(j.videoSource).replace(/\\\//g, "/");
  } catch (_) {}

  var vs = text.match(/["']?(?:videoSource|file)["']?\s*:\s*["'](https?:\/\/[^"'\s\\]+)["']/i);
  if (vs && !/(?:scripts\.php|\.js|\.css|\.jpg|\.png|\.webp|\.vtt|\.srt)/i.test(at(vs, 1))) {
    return at(vs, 1).replace(/\\\//g, "/");
  }
  var std = text.match(/(https?:\/\/[^"'\s\\]+\.(?:m3u8|mp4)[^"'\s\\]*)/i);
  if (std) return at(std, 1).replace(/\\\//g, "/");
  return "";
}

function checkEmbed(embedUrl, pageUrl, title, s, e, label, ua) {
  if (!embedUrl) return Promise.resolve(null);
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
            name: "Tooniboy • " + label,
            title: title + " S" + s + "E" + e + " [Multi-Audio: Telugu / Tamil / Hindi]",
            url: direct,
            type: "hls",
            quality: "HD",
            headers: { "Referer": targetUrl, "Origin": origin, "User-Agent": ua }
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
                name: "Tooniboy • " + label,
                title: title + " S" + s + "E" + e + " [Multi-Audio: Telugu / Tamil / Hindi]",
                url: apiStream,
                type: "hls",
                quality: "HD",
                headers: { "Referer": targetUrl, "Origin": origin, "User-Agent": ua }
              };
            }
            return null;
          });
      });
    })
    .catch(function() { return null; });
}

function scrapePage(pageUrl, title, s, e, ua, hdr) {
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
      if (embeds.length === 0) return [];
      return checkEmbed(at(embeds, 0), pageUrl, title, s, e, "Multi-Audio", ua).then(function(s1) {
        if (s1) return [s1];
        return checkEmbed(at(embeds, 1), pageUrl, title, s, e, "Server 2 (Multi-Audio)", ua).then(function(s2) {
          return s2 ? [s2] : [];
        });
      });
    })
    .catch(function() { return []; });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
  var hdr = { "User-Agent": ua, "Referer": BASE_URL + "/" };

  return getTitle(tmdbId, mediaType).then(function(title) {
    if (!title) return [];
    var slug = slugify(title);
    var s = season || 1;
    var e = episode || 1;

    if (mediaType === "movie") {
      return scrapePage(BASE_URL + "/movies/" + slug + "/", title, s, e, ua, hdr);
    }

    var primaryUrl = BASE_URL + "/episode/" + slug + "-" + s + "x" + e + "/";
    return scrapePage(primaryUrl, title, s, e, ua, hdr).then(function(list) {
      if (list && list.length > 0) return list;

      // Fallback: search tooniboy.xyz directly for the exact episode URL
      var q = title.replace(/[:\-]/g, " ");
      return fetch(BASE_URL + "/?s=" + encodeURIComponent(q), { headers: hdr })
        .then(function(sr) { return sr.text(); })
        .then(function(sHtml) {
          var epRe = new RegExp('href="(https?:\\/\\/tooniboy\\.xyz\\/episode\\/[^"]*-' + s + "x" + e + '\\/?)"', "i");
          var epM = sHtml.match(epRe);
          if (epM) {
            return scrapePage(at(epM, 1), title, s, e, ua, hdr);
          }
          var serM = sHtml.match(/href="(https?:\/\/tooniboy\.xyz\/series\/[^"]+\/?)"/i);
          if (serM) {
            var serSlug = at(at(serM, 1).replace(/\/+$/, "").split("/"), 4);
            if (serSlug) {
              return scrapePage(BASE_URL + "/episode/" + serSlug + "-" + s + "x" + e + "/", title, s, e, ua, hdr);
            }
          }
          return [];
        });
    });
  }).catch(function() { return []; });
}

module.exports = { getStreams: getStreams };
