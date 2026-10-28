// Compact in-memory copy of every normalized stream, so the history can be re-aggregated for any
// year range without re-reading the zip. Repeated strings (artists, tracks, devices...) are interned.
(function (root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const api = factory(isNode ? require("./analyze.js") : root.SpotifyPersona.analyze);
  if (isNode) module.exports = api;
  else root.SpotifyPersona.store = api;
})(typeof self !== "undefined" ? self : this, function ({ normalize }) {
  const MUSIC = 0, PODCAST = 1;
  const HAS_BEHAVIOR = 1, SKIPPED = 2, SHUFFLE = 4, INCOGNITO = 8;

  function createInterner() {
    const ids = new Map(), values = [];
    return {
      id(value) {
        if (value === null || value === undefined) return -1;
        let id = ids.get(value);
        if (id === undefined) { id = values.length; ids.set(value, id); values.push(value); }
        return id;
      },
      value: id => (id < 0 ? null : values[id])
    };
  }

  function createRecordStore() {
    const tracks = createInterner(), shows = createInterner(), countries = createInterner();
    const platforms = createInterner(), reasons = createInterner();
    const trackInfo = [];
    const time = [], ms = [], year = [], kind = [], ref = [], flags = [], country = [], platform = [], reason = [];

    /** Adds one raw export record and returns it normalized, or null for records that are neither music nor podcasts. */
    function addRaw(raw) {
      const r = normalize(raw);
      if (!r || isNaN(r.date)) return null;
      let refId;
      if (r.kind === "podcast") {
        refId = shows.id(r.show);
      } else {
        const key = `${r.track}\u0000${r.artist}\u0000${r.album || ""}\u0000${r.trackId || ""}`;
        refId = tracks.id(key);
        if (refId === trackInfo.length) trackInfo.push({ artist: r.artist, track: r.track, album: r.album, trackId: r.trackId });
      }
      time.push(r.date.getTime());
      ms.push(r.ms);
      year.push(r.date.getFullYear());
      kind.push(r.kind === "podcast" ? PODCAST : MUSIC);
      ref.push(refId);
      flags.push(r.skipped === null ? 0 : HAS_BEHAVIOR | (r.skipped ? SKIPPED : 0) | (r.shuffle ? SHUFFLE : 0) | (r.incognito ? INCOGNITO : 0));
      country.push(countries.id(r.country));
      platform.push(platforms.id(r.platform));
      reason.push(reasons.id(r.reasonStart));
      return r;
    }

    /**
     * Calls fn with a normalized record for every stream whose local year is within [fromYear, toYear],
     * leaving out music by any artist in hiddenArtists.
     */
    function each({ fromYear = -Infinity, toYear = Infinity, hiddenArtists = [] } = {}, fn) {
      const hidden = new Set(hiddenArtists);
      for (let i = 0; i < time.length; i++) {
        if (year[i] < fromYear || year[i] > toYear) continue;
        if (hidden.size && kind[i] === MUSIC && hidden.has(trackInfo[ref[i]].artist)) continue;
        const f = flags[i], hasBehavior = (f & HAS_BEHAVIOR) !== 0;
        const base = {
          date: new Date(time[i]),
          ms: ms[i],
          skipped: hasBehavior ? (f & SKIPPED) !== 0 : null,
          shuffle: hasBehavior ? (f & SHUFFLE) !== 0 : null,
          incognito: hasBehavior ? (f & INCOGNITO) !== 0 : null,
          country: countries.value(country[i]),
          platform: platforms.value(platform[i]),
          reasonStart: reasons.value(reason[i])
        };
        fn(kind[i] === PODCAST ? { ...base, kind: "podcast", show: shows.value(ref[i]) } : { ...base, kind: "music", ...trackInfo[ref[i]] });
      }
    }

    /** The calendar years that have music, oldest first. */
    function years() {
      const set = new Set();
      for (let i = 0; i < time.length; i++) if (kind[i] === MUSIC) set.add(year[i]);
      return [...set].sort((a, b) => a - b);
    }

    return { addRaw, each, years, get size() { return time.length; } };
  }

  return { createRecordStore };
});
