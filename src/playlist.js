// Turns lists of songs into Spotify links that can be pasted into a playlist in the Spotify app.
// No login and no API: it only uses the track IDs that are already in the user's own export.
(function (root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const deps = isNode
    ? { analyze: require("./analyze.js"), genres: require("./genres.js") }
    : { analyze: root.SpotifyPersona.analyze, genres: root.SpotifyPersona.genres };
  const api = factory(deps);
  if (isNode) module.exports = api;
  else root.SpotifyPersona.playlist = api;
})(typeof self !== "undefined" ? self : this, function ({ analyze: { calendarOf }, genres: { genreOf } }) {
  const DEFAULT_SIZE = 50;
  const keyOf = (track, artist) => `${track}\u0000${artist}`;

  // Song name + artist to Spotify track ID, cached per timeline. The timeline keeps one entry per
  // song and artist (with the first ID seen), so a song on several albums still gets one link.
  const lookupCache = new WeakMap();
  function lookup(timeline) {
    let byKey = lookupCache.get(timeline);
    if (byKey) return byKey;
    const ids = timeline.trackSpotifyIds || [];
    byKey = new Map();
    for (let t = 0; t < timeline.trackNames.length; t++) {
      if (ids[t]) byKey.set(keyOf(timeline.trackNames[t], timeline.artistNames[timeline.trackArtist[t]]), ids[t]);
    }
    lookupCache.set(timeline, byKey);
    return byKey;
  }

  /** The Spotify track ID for a song by name and artist, or null. */
  function idFor(timeline, track, artist) {
    return lookup(timeline).get(keyOf(track, artist)) || null;
  }

  // Album id to the Spotify ID of one of its tracks, which is all a cover lookup needs.
  const albumCache = new WeakMap();
  function albumTrackId(timeline, albumId) {
    let byAlbum = albumCache.get(timeline);
    if (!byAlbum) {
      byAlbum = new Map();
      const ids = timeline.trackSpotifyIds || [];
      for (let t = 0; t < timeline.trackNames.length; t++) {
        const album = timeline.trackAlbum[t];
        if (album >= 0 && ids[t] && !byAlbum.has(album)) byAlbum.set(album, ids[t]);
      }
      albumCache.set(timeline, byAlbum);
    }
    return byAlbum.get(albumId) || null;
  }

  // Artist id to the Spotify ID of their most played song, so an artist can be shown by that song's cover.
  const artistCache = new WeakMap();
  function artistTrackId(timeline, artistId) {
    let byArtist = artistCache.get(timeline);
    if (!byArtist) {
      const ids = timeline.trackSpotifyIds || [];
      const plays = new Float64Array(timeline.trackNames.length);
      for (let i = 0; i < timeline.slot.length; i++) plays[timeline.track[i]] += timeline.plays[i];
      const best = new Map();
      for (let t = 0; t < timeline.trackNames.length; t++) {
        if (!ids[t]) continue;
        const artist = timeline.trackArtist[t];
        if (!best.has(artist) || plays[t] > plays[best.get(artist)]) best.set(artist, t);
      }
      byArtist = new Map([...best].map(([artist, t]) => [artist, ids[t]]));
      artistCache.set(timeline, byArtist);
    }
    return byArtist.get(artistId) || null;
  }

  /** True when the export has Spotify track IDs at all (the basic account-data export does not). */
  function available(timeline) {
    return (timeline.trackSpotifyIds || []).some(Boolean);
  }

  /** Spotify links for songs given as { track, artist }, in order, without duplicates or unknown songs. */
  function linksFor(timeline, songs) {
    const byKey = lookup(timeline);
    const seen = new Set();
    const links = [];
    for (const s of songs) {
      const id = byKey.get(keyOf(s.track, s.artist));
      if (!id || seen.has(id)) continue;
      seen.add(id);
      links.push(`https://open.spotify.com/track/${id}`);
    }
    return links;
  }

  /**
   * The most played songs in a slice of the history, as { track, artist, plays }.
   * Every filter is optional: years [from, to], months (1-12), a genre key, or a pattern the song name must match.
   */
  function topSongs(timeline, { years = null, months = null, genre = null, match = null } = {}, size = DEFAULT_SIZE) {
    const calendar = calendarOf(timeline);
    const monthSet = months ? new Set(months) : null;
    const artistOk = genre ? timeline.artistNames.map(name => genreOf(name) === genre) : null;
    const nameOk = match ? timeline.trackNames.map(name => match.test(name)) : null;
    const plays = new Map();
    for (let i = 0; i < timeline.slot.length; i++) {
      if (timeline.plays[i] === 0) continue;
      const t = timeline.track[i];
      if (nameOk && !nameOk[t]) continue;
      if (artistOk && !artistOk[timeline.trackArtist[t]]) continue;
      if (years || monthSet) {
        const c = calendar(timeline.slot[i]);
        if (years && (c.year < years[0] || c.year > years[1])) continue;
        if (monthSet && !monthSet.has(c.month)) continue;
      }
      plays.set(t, (plays.get(t) || 0) + timeline.plays[i]);
    }
    return [...plays.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, size)
      .map(([t, n]) => ({ track: timeline.trackNames[t], artist: timeline.artistNames[timeline.trackArtist[t]], plays: n }));
  }

  return { available, idFor, albumTrackId, artistTrackId, linksFor, topSongs, DEFAULT_SIZE };
});
