
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
    "?api_key=" + encodeURIComponent(TMDB_KEY))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      return d ? (d.name || d.title || "") : "";
    });
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

        var trRegex = /(https?:\/\/tooniboy\.xyz\/\?trembed=\d+[^"'\s<>]*|\/\?trembed=\d+[^"'\s<>]*)/gi;
        var m;

        while ((m = trRegex.exec(html)) !== null) {
          var u = m[1].replace(/&amp;/g, "&");
          if (u.indexOf("/") === 0) u = BASE_URL + u;
          if (embeds.indexOf(u) === -1) embeds.push(u);
        }

        var regex = /(?:<iframe[^>]+(?:src|data-src)|data-url)=["']([^"']+)["']/gi;

        while ((m = regex.exec(html)) !== null) {
          var u2 = m[1].replace(/&amp;/g, "&");

          if (u2.indexOf("//") === 0) u2 = "https:" + u2;
          if (u2.indexOf("/") === 0) u2 = BASE_URL + u2;

          if (u2 &&
              !/youtube|facebook|google|ads|gravatar/i.test(u2) &&
              embeds.indexOf(u2) === -1) {
            embeds.push(u2);
          }
        }

        if (embeds.length === 0) {
          return [{
            name: "DEBUG: NO EMBEDS FOUND",
            title: "HTTP " + status + " | HTML " + html.length,
            url: pageUrl,
            quality: "DEBUG"
          }];
        }

        return embeds.map(function(link, index) {
          return {
            name: "EMBED " + (index + 1) + ": " + link,
            title: title + " | Player URL",
            url: pageUrl,
            quality: "DEBUG",
            headers: {
              "Referer": BASE_URL + "/"
            }
          };
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
