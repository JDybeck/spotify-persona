// Queries the per-hour timeline for any date range and optional genre: totals, top lists, genre mix and clocks.
// Pure logic with no DOM access, shared by the page and the Node tests.
(function (root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const deps = isNode
    ? { genres: require("./genres.js"), analyze: require("./analyze.js") }
    : { genres: root.SpotifyPersona.genres, analyze: root.SpotifyPersona.analyze };
  const api = factory(deps);
  if (isNode) module.exports = api;
  else root.SpotifyPersona.explore = api;
})(typeof self !== "undefined" ? self : this, function ({ genres: { GENRES, genreOf }, analyze: { dayNumber } }) {
  const TOP = 10;
  const MINUTE_MS = 60000;
  const HOUR_MS = 3600000;

  const parseDay = s => { const [y, m, d] = s.split("-").map(Number); return dayNumber(y, m - 1, d); };

  /** Ranges relative to the last stream, then all time, then every calendar year (newest first). */
  function ranges(stats) {
    const last = parseDay(stats.last);
    const list = [
      { key: "4w", label: "Last 4 weeks", from: last - 27, to: last },
      { key: "6m", label: "Last 6 months", from: last - 182, to: last },
      { key: "12m", label: "Last 12 months", from: last - 364, to: last },
      { key: "all", label: "All time", from: -Infinity, to: Infinity }
    ];
    for (const y of [...stats.years].reverse()) {
      list.push({ key: `y${y.year}`, label: String(y.year), year: y.year, from: dayNumber(y.year, 0, 1), to: dayNumber(y.year, 11, 31) });
    }
    return list;
  }

  // Genre lookups per artist are cached per timeline, since every query would otherwise repeat them.
  const genreCache = new WeakMap();
  function artistGenres(timeline) {
    let cached = genreCache.get(timeline);
    if (!cached) {
      cached = timeline.artistNames.map(name => genreOf(name));
      genreCache.set(timeline, cached);
    }
    return cached;
  }

  /** Genres that appear anywhere in the history, for the genre filter. */
  function availableGenres(timeline) {
    const present = new Set(artistGenres(timeline).filter(Boolean));
    return Object.keys(GENRES).filter(g => present.has(g)).map(key => ({ key, label: GENRES[key].label }));
  }

  function topIndices(values, n) {
    const idx = [];
    for (let i = 0; i < values.length; i++) if (values[i] > 0) idx.push(i);
    return idx.sort((a, b) => values[b] - values[a]).slice(0, n);
  }

  /**
   * Everything the explore view shows for one range, optionally limited to one genre.
   * Like Spotify's own stats, streams and distinct counts only include plays of 30 seconds or more,
   * while minutes and hours include all time played.
   */
  function query(timeline, range, genre = null, songCount = TOP) {
    const genres = artistGenres(timeline);
    const { slot, track, streams, plays, ms, trackArtist, trackAlbum } = timeline;
    const trackCount = timeline.trackNames.length, artistCount = timeline.artistNames.length;
    const trackPlays = new Float64Array(trackCount), trackMs = new Float64Array(trackCount);
    const artistMs = new Float64Array(artistCount), artistPlays = new Float64Array(artistCount);
    const albumSeen = new Set();
    const clockStreams = new Array(24).fill(0), clockMs = new Array(24).fill(0);
    const genreMs = new Map();
    let totalStreams = 0, totalMs = 0, hasAlbums = false;
    const fromSlot = range.from * 24, toSlot = range.to * 24 + 23;

    for (let i = 0; i < slot.length; i++) {
      const s = slot[i];
      if (s < fromSlot || s > toSlot) continue;
      const t = track[i], a = trackArtist[t], g = genres[a];
      if (genre && g !== genre) continue;
      totalStreams += plays[i];
      totalMs += ms[i];
      trackPlays[t] += plays[i];
      trackMs[t] += ms[i];
      artistMs[a] += ms[i];
      artistPlays[a] += plays[i];
      const album = trackAlbum[t];
      if (album >= 0) {
        hasAlbums = true;
        if (plays[i] > 0) albumSeen.add(album);
      }
      const hour = ((s % 24) + 24) % 24;
      clockStreams[hour] += plays[i];
      clockMs[hour] += ms[i];
      if (g) genreMs.set(g, (genreMs.get(g) || 0) + ms[i]);
    }

    let tracks = 0, artists = 0;
    for (let t = 0; t < trackCount; t++) if (trackPlays[t] > 0) tracks++;
    for (let a = 0; a < artistCount; a++) if (artistPlays[a] > 0) artists++;
    const taggedMs = [...genreMs.values()].reduce((s, v) => s + v, 0);

    return {
      streams: totalStreams,
      minutes: totalMs / MINUTE_MS,
      hours: totalMs / HOUR_MS,
      tracks,
      artists,
      albums: hasAlbums ? albumSeen.size : null,
      topArtists: topIndices(artistMs, TOP).map(a => ({ name: timeline.artistNames[a], hours: artistMs[a] / HOUR_MS, plays: artistPlays[a] })),
      topTracks: topIndices(trackPlays, songCount).map(t => ({
        track: timeline.trackNames[t], artist: timeline.artistNames[trackArtist[t]], plays: trackPlays[t], hours: trackMs[t] / HOUR_MS
      })),
      clock: { streams: clockStreams, minutes: clockMs.map(v => v / MINUTE_MS) },
      mix: [...genreMs.entries()].sort((a, b) => b[1] - a[1]).map(([key, v]) => ({ key, label: GENRES[key].label, share: v / taggedMs }))
    };
  }

  return { ranges, query, availableGenres };
});
