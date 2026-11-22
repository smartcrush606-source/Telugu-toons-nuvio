
var BASE_URL = "https://tooniboy." + "xyz";
var TMDB_KEY = "f2999de87d4e2c1dcde9aa5f60721bf7";

function slugify(text) {
  return String(text)
    .replace(/\(\d{4}\)/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getTitle(id, mediaType) {
  var type = mediaType === "movie" ? "movie" : "tv";

  if (String(id).indexOf("tt") === 0) {
    var kind = mediaType === "movie" ? "movie" : "series";

    return fetch("https://v3-cinemeta." +
      "strem.io/meta/" + kind + "/" + id + ".json")
      .then(function(r) { return r.json(); })
      .then(function(d) {
        return d && d.meta ? d.meta.name : "";
      });
  }

  return fetch("https://api.themoviedb." +
    "org/3/" + type + "/" + id +
    "?api_key=" + encodeURIComponent(TMBD_KEY_FIX()))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      return d ? (d.name || d.title || "") : "";
    });
}

function TMBD_KEY_FIX() {
  return TMDB_KEY;
}

function extractInfo(html) {
  var iframe = "";
  var stream = "";

  var im = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (im) iframe = im[1];

  var sm = html.match(/(?:file|videoSource|hls2|hls3|hls4)\s*[:=]\s*["'](https?:\/\/[^"']+)["']/i);
  if (sm) stream = sm[1];

  if (!stream) {
    var fm = html.match(/https?:\/\/[^"' \s<>]+\.(?:m3u8|mp4)(?:\?[^"' \s<>]*)?/i);
    if (fm) stream = fm[0];
  }

  return {
    iframe: iframe,
    stream: stream
  };
}

function getStreams(tmdbId, mediaType, season, episode) {
  var ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36";

  return getTitle(tmdbId, mediaType).then(function(title) {
    if (!title) {
      return [{
        name: "DEBUG: TITLE LOOKUP FAILED",
        title: "TMDB returned no title",
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

    return fetch(pageUrl, {
      headers: {
        "User-Agent": ua,
        "Referer": BASE_URL + "/"
      }
    }).then(function(r) {
      var status = r.status;

      return r.text().then(function(html) {
        var embeds = [];

        var tr = /(https?:\/\/tooniboy\.xyz\/\?trembed=\d+[^"'\s<>]*|\/\?trembed=\d+[^"'\s<>]*)/gi;
        var m;

        while ((m = tr.exec(html)) !== null) {
          var u = m[1].replace(/&amp;/g, "&");
          if (u.indexOf("/") === 0) u = BASE_URL + u;
          if (embeds.indexOf(u) === -1) embeds.push(u);
        }

        var re = /(?:<iframe[^>]+(?:src|data-src)|data-url)=["']([^"']+)["']/gi;

        while ((m = re.exec(html)) !== null) {
          var u2 = m[1].replace(/&amp;/g, "&");
          if (u2.indexOf("//") === 0) u2 = "https:" + u2;
          if (u2.indexOf("/") === 0) u2 = BASE_URL + u2;

          if (u2 &&
              !/youtube|facebook|google|ads|gravatar/i.test(u2) &&
              embeds.indexOf(u2) === -1) {
            embeds.push(u2);
          }
        }

        var selected = [];

        for (var i = 0; i < embeds.length; i++) {
          if (/ravok\.buzz|rubystm\.com|abyssplayer\.com/i.test(embeds[i])) {
            selected.push(embeds[i]);
          }
        }

        if (selected.length === 0) {
          return [{
            name: "DEBUG: TARGET PLAYERS NOT FOUND",
            title: "HTTP " + status + " | Embeds " + embeds.length,
            url: pageUrl,
            quality: "DEBUG"
          }];
        }

        var jobs = selected.map(function(link) {
          return fetch(link, {
            headers: {
              "User-Agent": ua,
              "Referer": pageUrl
            }
          }).then(function(response) {
            return response.text().then(function(body) {
              var info = extractInfo(body);
              var host = link.match(/^https?:\/\/([^/]+)/i);

              return {
                name: "PLAYER " + (host ? host[1] : "UNKNOWN") +
                  " | HTTP " + response.status,
                title: "HTML " + body.length +
                  " chars | iframe: " + (info.iframe || "none") +
                  " | stream: " + (info.stream || "none"),
                url: pageUrl,
                quality: "DEBUG",
                headers: {
                  "Referer": pageUrl
                }
              };
            });
          }).catch(function(err) {
            return {
              name: "PLAYER FETCH FAILED: " + link,
              title: String(err).slice(0, 180),
              url: pageUrl,
              quality: "DEBUG"
            };
          });
        });

        return Promise.all(jobs);
      });
    });
  }).catch(function(err) {
    return [{
      name: "DEBUG ERROR",
      title: String(err).slice(0, 250),
      url: BASE_URL + "/",
      quality: "DEBUG"
    }];
  });
}

module.exports = {
  getStreams: getStreams
};
