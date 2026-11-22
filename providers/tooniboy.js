
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

function diagnostic(message, pageUrl) {
  return [{
    name: "DEBUG: " + message,
    title: "Tooniboy diagnostic",
    url: pageUrl || BASE_URL + "/",
    quality: "DEBUG",
    headers: { "Referer": BASE_URL + "/" }
  }];
}

function parseResponse(response, source) {
  return response.text().then(function(body) {
    var data;

    try {
      data = JSON.parse(body);
    } catch (err) {
      throw new Error(source + " returned non-JSON data. HTTP " +
        response.status + ". Response: " + body.slice(0, 180));
    }

    if (!response.ok) {
      throw new Error(source + " HTTP " + response.status +
        ": " + JSON.stringify(data).slice(0, 220));
    }

    if (data && data.success === false) {
      throw new Error(source + ": " +
        (data.status_message || JSON.stringify(data).slice(0, 180)));
    }

    return data;
  });
}

function getTitle(tmdbId, mediaType) {
  var id = String(tmdbId);

  if (id.indexOf("tt") === 0) {
    var kind = mediaType === "movie" ? "movie" : "series";
    var url = "https://v3-cinemeta." +
      "strem.io/meta/" + kind + "/" + id + ".json";

    return fetch(url)
      .then(function(r) {
        return parseResponse(r, "Cinemeta");
      })
      .then(function(data) {
        if (data && data.meta && data.meta.name) {
          return data.meta.name;
        }
        throw new Error("Cinemeta response has no title for " + id);
      });
  }

  if (!TMDB_KEY ||
      TMDB_KEY === "PASTE_YOUR_NEW_V3_API_KEY_HERE") {
    return Promise.reject(
      new Error("TMDB API key is missing. Add your v3 API key.")
    );
  }

  var type = mediaType === "movie" ? "movie" : "tv";
  var url = "https://api.themoviedb." + "org/3/" +
    type + "/" + encodeURIComponent(id) +
    "?api_key=" + encodeURIComponent(TMDB_KEY);

  return fetch(url)
    .then(function(r) {
      return parseResponse(r, "TMDB");
    })
    .then(function(data) {
      var title = data.name || data.title;

      if (!title) {
        throw new Error(
          "TMDB returned no title. ID: " + id +
          ", type: " + type
        );
      }

      return title;
    });
}

function discoverEmbeds(html) {
  var embeds = [];

  var trRegex =
    /(https?:\/\/tooniboy\.xyz\/\?trembed=\d+[^"'\s<>]*|\/\?trembed=\d+[^"'\s<>]*)/gi;

  var match;

  while ((match = trRegex.exec(html)) !== null) {
    var link = at(match, 1).replace(/&amp;/g, "&");

    if (link.indexOf("/") === 0) {
      link = BASE_URL + link;
    }

    if (embeds.indexOf(link) === -1) {
      embeds.push(link);
    }
  }

  var regex =
    /(?:<iframe[^>]+(?:src|data-src)|data-url)=["']([^"']+)["']/gi;

  while ((match = regex.exec(html)) !== null) {
    var link2 = at(match, 1).replace(/&amp;/g, "&");

    if (link2.indexOf("//") === 0) {
      link2 = "https:" + link2;
    }

    if (link2.indexOf("/") === 0) {
      link2 = BASE_URL + link2;
    }

    if (link2 &&
        !/youtube|facebook|google|ads|gravatar/i.test(link2) &&
        embeds.indexOf(link2) === -1) {
      embeds.push(link2);
    }
  }

  return embeds;
}

function getStreams(tmdbId, mediaType, season, episode) {
  var stage = "Starting title lookup";

  return getTitle(tmdbId, mediaType)
    .then(function(title) {
      stage = "Title found: " + title;

      var slug = slugify(title);
      var s = season || 1;
      var e = episode || 1;

      var pageUrl = mediaType === "movie"
        ? BASE_URL + "/movies/" + slug + "/"
        : BASE_URL + "/episode/" + slug + "-" + s + "x" + e + "/";

      stage = "Fetching episode: " + pageUrl;

      return fetch(pageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36",
          "Referer": BASE_URL + "/"
        }
      }).then(function(response) {
        var status = response.status;

        return response.text().then(function(html) {
          var embeds = discoverEmbeds(html);

          if (embeds.length === 0) {
            return diagnostic(
              "Title: " + title +
              " | Episode HTTP " + status +
              " | HTML " + html.length +
              " chars | No embeds found",
              pageUrl
            );
          }

          var results = [];

          for (var i = 0; i < embeds.length; i++) {
            results.push({
              name: "DEBUG EMBED " + (i + 1),
              title: embeds[i],
              url: pageUrl,
              quality: "DEBUG",
              headers: {
                "Referer": BASE_URL + "/"
              }
            });
          }

          return results;
        });
      });
    })
    .catch(function(err) {
      return diagnostic(
        "ERROR at " + stage + " | " +
        String(err).slice(0, 260)
      );
    });
}

module.exports = {
  getStreams: getStreams
};
