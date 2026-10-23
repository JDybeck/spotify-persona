// Search the timeline for artists, songs and albums, and build a detail view for one of them.
// Pure logic with no DOM access, shared by the page and the Node tests.
(function (root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const api = factory(isNode ? require("./analyze.js") : root.SpotifyPersona.analyze);
  if (isNode) module.exports = api;
  else root.SpotifyPersona.search = api;
})(typeof self !== "undefined" ? self : this, function ({ calendarOf }) {
  const HOUR_MS = 3600000;
  const MIN_QUERY = 2;

  /** Lowercase without accents, so "tiesto" finds "Tiësto" and "hakan" finds "Håkan". */
  function fold(s) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ø/g, "o").replace(/æ/g, "ae").toLowerCase();
  }

  // Totals and folded names are computed once per timeline and reused by every keystroke.
  const indexCache = new WeakMap();
  function indexOf(timeline) {
    let index = indexCache.get(timeline);
    if (index) return index;
    const sizes = { artist: timeline.artistNames.length, track: timeline.trackNames.length, album: (timeline.albumNames || []).length };
    const plays = { artist: new Float64Array(sizes.artist), track: new Float64Array(sizes.track), album: new Float64Array(sizes.album) };
    const ms = { artist: new Float64Array(sizes.artist), track: new Float64Array(sizes.track), album: new Float64Array(sizes.album) };
    for (let i = 0; i < timeline.slot.length; i++) {
      const t = timeline.track[i], a = timeline.trackArtist[t], al = timeline.trackAlbum[t];
      plays.track[t] += timeline.plays[i]; ms.track[t] += timeline.ms[i];
      plays.artist[a] += timeline.plays[i]; ms.artist[a] += timeline.ms[i];
      if (al >= 0) { plays.album[al] += timeline.plays[i]; ms.album[al] += timeline.ms[i]; }
    }
    index = {
      plays, ms,
      names: {
        artist: timeline.artistNames.map(fold),
        track: timeline.trackNames.map(fold),
        album: (timeline.albumNames || []).map(fold)
      }
    };
    indexCache.set(timeline, index);
    return index;
  }

  function label(timeline, kind, id) {
    if (kind === "artist") return { name: timeline.artistNames[id], by: null };
    if (kind === "track") return { name: timeline.trackNames[id], by: timeline.artistNames[timeline.trackArtist[id]] };
    return { name: timeline.albumNames[id], by: timeline.artistNames[timeline.albumArtist[id]] };
  }

  const withoutThe = s => s.replace(/^the /, "");

  /**
   * How well a matching name fits: mostly plays, boosted for an exact name and a little for a prefix,
   * ignoring a leading "the" so "midnight" finds The Midnight first.
   */
  function relevance(name, phrase, plays) {
    const bare = withoutThe(name);
    if (name === phrase || bare === phrase) return plays * 1000 + 1;
    if (bare.startsWith(phrase)) return plays * 3 + 1;
    return plays + 1;
  }

  /** Matches names containing every word of the query, best fit first. Returns up to `limit` results per kind. */
  function search(timeline, query, limit = 5) {
    const words = fold(query).trim().split(/\s+/).filter(Boolean);
    const empty = { artists: [], tracks: [], albums: [] };
    if (words.join(" ").length < MIN_QUERY) return empty;
    const index = indexOf(timeline);
    const phrase = words.join(" ");

    const find = kind => {
      const names = index.names[kind];
      const hits = [];
      for (let id = 0; id < names.length; id++) {
        if (index.plays[kind][id] === 0) continue;
        if (words.every(w => names[id].includes(w))) hits.push(id);
      }
      const score = id => relevance(names[id], phrase, index.plays[kind][id]);
      return hits
        .sort((a, b) => score(b) - score(a))
        .slice(0, limit)
        .map(id => ({ kind, id, ...label(timeline, kind, id), plays: index.plays[kind][id], hours: index.ms[kind][id] / HOUR_MS }));
    };
    return { artists: find("artist"), tracks: find("track"), albums: find("album") };
  }

  /** All-time rank by plays among everything of the same kind (1 = most played). */
  function rankOf(index, kind, id) {
    const own = index.plays[kind][id];
    let rank = 1;
    for (const p of index.plays[kind]) if (p > own) rank++;
    return rank;
  }

  /** Everything about one artist, song or album: totals, first and last play, peak day, plays per year and top lists. */
  function detail(timeline, kind, id) {
    const index = indexOf(timeline);
    const calendar = calendarOf(timeline);
    const matches = kind === "artist" ? t => timeline.trackArtist[t] === id
      : kind === "track" ? t => t === id
      : t => timeline.trackAlbum[t] === id;

    let firstSlot = Infinity, lastSlot = -Infinity, streams = 0;
    const perYear = new Map(), perDay = new Map(), trackPlays = new Map(), albumPlays = new Map();
    for (let i = 0; i < timeline.slot.length; i++) {
      const t = timeline.track[i];
      if (!matches(t)) continue;
      const p = timeline.plays[i], s = timeline.slot[i];
      streams += timeline.streams[i];
      if (p === 0) continue;
      if (s < firstSlot) firstSlot = s;
      if (s > lastSlot) lastSlot = s;
      const c = calendar(s);
      const y = perYear.get(c.year) || { plays: 0, ms: 0 };
      y.plays += p; y.ms += timeline.ms[i];
      perYear.set(c.year, y);
      perDay.set(c.iso, (perDay.get(c.iso) || 0) + p);
      trackPlays.set(t, (trackPlays.get(t) || 0) + p);
      const al = timeline.trackAlbum[t];
      if (al >= 0) albumPlays.set(al, (albumPlays.get(al) || 0) + p);
    }

    const plays = index.plays[kind][id];
    if (plays === 0) return null;
    const years = [...perYear.keys()].sort((a, b) => a - b);
    const allYears = [];
    for (let y = years[0]; y <= years[years.length - 1]; y++) {
      const v = perYear.get(y) || { plays: 0, ms: 0 };
      allYears.push({ year: y, plays: v.plays, hours: v.ms / HOUR_MS });
    }
    const peak = [...perDay.entries()].reduce((best, e) => (e[1] > best[1] ? e : best));
    const top = (map, n, toItem) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, n]) => toItem(key, n));

    return {
      kind,
      id,
      ...label(timeline, kind, id),
      plays,
      streams,
      hours: index.ms[kind][id] / HOUR_MS,
      rank: rankOf(index, kind, id),
      first: calendar(firstSlot).iso,
      last: calendar(lastSlot).iso,
      peakDay: { date: peak[0], plays: peak[1] },
      perYear: allYears,
      topTracks: kind === "track" ? [] : top(trackPlays, 10, (t, n) => ({ id: t, track: timeline.trackNames[t], plays: n })),
      topAlbums: kind === "artist" ? top(albumPlays, 5, (al, n) => ({ id: al, album: timeline.albumNames[al], plays: n })) : []
    };
  }

  return { search, detail, fold, MIN_QUERY };
});
