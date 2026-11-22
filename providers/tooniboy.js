
var BASE_URL = "https://tooniboy.xyz";


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

    return fetch("https://v3-cinemeta.strem.io/meta/" +
      kind + "/" + id + ".json")
      .then(function(r) { return r.json(); })
      .then(function(d) {
        return d && d.meta ? d.meta.name : "";
      });
  }

  return fetch("https://api.themoviedb.org/3/" +
    type + "/" + id +
    "?api_key=" + encodeURIComponent(TMDB_KEY))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      return d ? (d.name || d.title || "") : "";
    });
}

function cleanText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getPlayerClues(html) {
  var scripts = [];
  var matches = [];
  var m;

  var scriptRe = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;

  while ((m = scriptRe.exec(html)) !== null) {
    var src = m[1].replace(/&amp;/g, "&");

    if (src.indexOf("//") === 0) src = "https:" + src;

    if (scripts.indexOf(src) === -1) {
      scripts.push(src);
    }
  }

  var patterns = [
    /[^;{}]{0,100}(?:m3u8|videoSource|sources|file|hls2|hls3|hls4)[^;{}]{0,180}/gi,
    /[^;{}]{0,100}(?:atob|base64|jwplayer|playerjs|hls\.js)[^;{}]{0,180}/gi,
    /[^;{}]{0,100}(?:fetch\(|XMLHttpRequest|ajax\(|getVideo)[^;{}]{0,180}/gi
  ];

  for (var i = 0; i < patterns.length; i++) {
    while ((m = patterns[i].exec(html)) !== null) {
      var clue = cleanText(m[0]);

      if (clue && matches.indexOf(clue) === -1) {
        matches.push(clue);
      }

      if (matches.length >= 12) break;
    }
  }

  var iframe = "";
  var im = html.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  if (im) iframe = im[1];

  var direct = "";
  var dm = html.match(/https?:\/\/[^"' \s<>]+\.(?:m3u8|mp4)(?:\?[^"' \s<>]*)?/i);
  if (dm) direct = dm[0];

  return {
    scripts: scripts,
    clues: matches,
    iframe: iframe,
    direct: direct
  };
}

function getStreams(tmdbId, mediaType, season, episode) {
  var ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36";

  return getTitle(tmdbId, mediaType).then(function(title) {
    if (!title) {
      return [{
        name: "DEBUG: TITLE LOOKUP FAILED",
        title: "Check TMDB key or title lookup",
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
        var m;

        var tr = /(https?:\/\/tooniboy\.xyz\/\?trembed=\d+[^"'\s<>]*|\/\?trembed=\d+[^"'\s<>]*)/gi;

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
              var info = getPlayerClues(body);
              var hostMatch = link.match(/^https?:\/\/([^/]+)/i);
              var host = hostMatch ? hostMatch[1] : "UNKNOWN";
              var results = [];

              results.push({
                name: host.toUpperCase() + " | HTTP " +
                  response.status + " | SCRIPTS: " +
                  (info.scripts.length ? info.scripts.length : 0),
                title: "Player page HTML: " + body.length + " characters",
                url: pageUrl,
                quality: "DEBUG"
              });

              for (var j = 0; j < info.scripts.length; j += 3) {
                results.push({
                  name: host.toUpperCase() + " SCRIPT URLS: " +
                    info.scripts.slice(j, j + 3).join(" | ").slice(0, 230),
                  title: "Script references",
                  url: pageUrl,
                  quality: "DEBUG"
                });
              }

              for (var k = 0; k < info.clues.length; k += 2) {
                results.push({
                  name: host.toUpperCase() + " CONFIG: " +
                    info.clues.slice(k, k + 2).join(" || ").slice(0, 230),
                  title: "Player configuration clues",
                  url: pageUrl,
                  quality: "DEBUG"
                });
              }

              if (info.iframe || info.direct) {
                results.push({
                  name: host.toUpperCase() + " MEDIA: " +
                    ("iframe=" + (info.iframe || "none") +
                    " | direct=" + (info.direct || "none")).slice(0, 230),
                  title: "Detected media references",
                  url: pageUrl,
                  quality: "DEBUG"
                });
              }

              return results;
            });
          }).catch(function(err) {
            return [{
              name: "PLAYER FETCH FAILED: " + link,
              title: String(err).slice(0, 180),
              url: pageUrl,
              quality: "DEBUG"
            }];
          });
        });

        return Promise.all(jobs).then(function(groups) {
          var output = [];

          for (var x = 0; x < groups.length; x++) {
            output = output.concat(groups[x]);
          }

          return output;
        });
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
