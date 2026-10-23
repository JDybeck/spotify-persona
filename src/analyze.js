// Turns raw Spotify streaming records into aggregated listening stats.
// Pure logic with no DOM access, shared by the Web Worker and the Node tests.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.SpotifyPersona = root.SpotifyPersona || {}).analyze = api;
})(typeof self !== "undefined" ? self : this, function () {
  const HOUR_MS = 3600000;
  const MIN_PLAY_MS = 30000;
  const MIN_ARTIST_STARTS_FOR_SKIPS = 100;
  const NIGHT_HOURS = [22, 23, 0, 1, 2, 3];
  const MORNING_HOURS = [5, 6, 7, 8, 9];
  const MIN_PROFILE_PLAYS = 15;
  const MAX_PROFILES = 400;

  // Extended history: Streaming_History_Audio_2020.json. Basic account data: StreamingHistory_music_0.json, StreamingHistory0.json, StreamingHistory_podcast_0.json.
  const HISTORY_FILE = /(^|\/)(Streaming_History_Audio_[^/]*|StreamingHistory(_music|_podcast)?_?\d+)\.json$/i;

  function isHistoryFile(path) {
    return HISTORY_FILE.test(path);
  }

  /**
   * Maps one raw record from either export format to a common shape.
   * Returns null for records that are neither music nor podcasts (audiobooks, broken rows).
   * skipped/shuffle/incognito are null when the format does not record them.
   */
  function normalize(raw) {
    if (raw.ts !== undefined) {
      const base = {
        date: new Date(raw.ts),
        ms: raw.ms_played || 0,
        skipped: raw.skipped === true || raw.reason_end === "fwdbtn",
        shuffle: raw.shuffle === true,
        incognito: raw.incognito_mode === true,
        country: raw.conn_country && raw.conn_country !== "ZZ" ? raw.conn_country : null
      };
      if (raw.episode_show_name) return { ...base, kind: "podcast", show: raw.episode_show_name };
      if (raw.master_metadata_album_artist_name && raw.master_metadata_track_name) {
        return { ...base, kind: "music", artist: raw.master_metadata_album_artist_name, track: raw.master_metadata_track_name, album: raw.master_metadata_album_album_name || null };
      }
      return null;
    }
    if (raw.endTime !== undefined) {
      // Basic format timestamps are UTC without a zone marker: "2024-01-31 18:05".
      const base = { date: new Date(raw.endTime.replace(" ", "T") + "Z"), ms: raw.msPlayed || 0, skipped: null, shuffle: null, incognito: null, country: null };
      if (raw.podcastName) return { ...base, kind: "podcast", show: raw.podcastName };
      if (raw.artistName && raw.trackName && raw.artistName !== "Unknown Artist") {
        return { ...base, kind: "music", artist: raw.artistName, track: raw.trackName, album: null };
      }
      return null;
    }
    return null;
  }

  const trackKey = (track, artist) => `${track}\u0000${artist}`;
  const splitKey = key => { const [track, artist] = key.split("\u0000"); return { track, artist }; };
  const add = (map, key, value) => map.set(key, (map.get(key) || 0) + value);
  const hours = ms => Math.round(ms / HOUR_MS * 10) / 10;
  const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const topEntries = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  /** Local calendar day as a whole number, so ranges can be compared without time zones getting in the way. */
  const dayNumber = (year, monthIndex, day) => Math.round(Date.UTC(year, monthIndex, day) / 86400000);

  // Day numbers repeat across timeline rows, so their calendar parts are cached per timeline.
  const calendarCache = new WeakMap();

  /** Returns a function from a timeline slot (day * 24 + hour) to { day, year, month (1-12), date, iso }. */
  function calendarOf(timeline) {
    let cache = calendarCache.get(timeline);
    if (!cache) calendarCache.set(timeline, cache = new Map());
    return slot => {
      const day = Math.floor(slot / 24);
      let c = cache.get(day);
      if (!c) {
        const d = new Date(day * 86400000);
        const year = d.getUTCFullYear(), month = d.getUTCMonth() + 1, date = d.getUTCDate();
        c = { day, year, month, date, iso: `${year}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}` };
        cache.set(day, c);
      }
      return c;
    };
  }

  /**
   * Compact table of listening per (local day, hour, track), so any date range can be queried later.
   * Rows end up in typed arrays that can be transferred from the worker without copying.
   */
  function createTimelineBuilder() {
    const trackIds = new Map(), artistIds = new Map(), albumIds = new Map();
    const trackNames = [], trackArtist = [], trackAlbum = [], artistNames = [], albumNames = [], albumArtist = [];
    const rowIndex = new Map();
    const slot = [], track = [], streams = [], plays = [], ms = [];

    function intern(map, value, names) {
      let id = map.get(value);
      if (id === undefined) {
        id = map.size;
        map.set(value, id);
        if (names) names.push(value);
      }
      return id;
    }

    function add(r) {
      const d = r.date;
      const key = trackKey(r.track, r.artist);
      let id = trackIds.get(key);
      if (id === undefined) {
        id = trackIds.size;
        trackIds.set(key, id);
        trackNames.push(r.track);
        const artistId = intern(artistIds, r.artist, artistNames);
        trackArtist.push(artistId);
        let albumId = -1;
        if (r.album) {
          const albumKey = `${r.album}\u0000${r.artist}`;
          albumId = albumIds.get(albumKey);
          if (albumId === undefined) {
            albumId = albumIds.size;
            albumIds.set(albumKey, albumId);
            albumNames.push(r.album);
            albumArtist.push(artistId);
          }
        }
        trackAlbum.push(albumId);
      }
      const s = dayNumber(d.getFullYear(), d.getMonth(), d.getDate()) * 24 + d.getHours();
      let rows = rowIndex.get(s);
      if (!rows) rowIndex.set(s, rows = new Map());
      let i = rows.get(id);
      if (i === undefined) {
        i = slot.length;
        rows.set(id, i);
        slot.push(s); track.push(id); streams.push(0); plays.push(0); ms.push(0);
      }
      streams[i]++;
      if (r.ms >= MIN_PLAY_MS) plays[i]++;
      ms[i] += r.ms;
    }

    function build() {
      return {
        trackNames,
        artistNames,
        albumNames,
        albumArtist: Uint32Array.from(albumArtist),
        trackArtist: Uint32Array.from(trackArtist),
        trackAlbum: Int32Array.from(trackAlbum),
        slot: Int32Array.from(slot),
        track: Uint32Array.from(track),
        streams: Uint32Array.from(streams),
        plays: Uint32Array.from(plays),
        ms: Float64Array.from(ms)
      };
    }

    return { add, build };
  }

  /** Incremental aggregator, so files can be fed one at a time without holding them all in memory. */
  function createAggregator() {
    const timeline = createTimelineBuilder();
    const artistMs = new Map(), artistPlays = new Map(), artistYears = new Map();
    const artistStarts = new Map(), artistSkips = new Map();
    const trackMs = new Map(), trackPlays = new Map(), trackStarts = new Map(), trackSkips = new Map();
    const yearMs = new Map(), yearArtistMs = new Map(), yearTrackPlays = new Map(), yearCountries = new Map();
    const yearStreams = new Map(), yearPlays = new Map(), yearSkips = new Map();
    const trackNight = new Map(), trackMorning = new Map();
    const monthArtistMs = new Map(), dayMs = new Map(), dayTrackPlays = new Map(), showMs = new Map();
    const hourMs = new Array(24).fill(0), weekdayMs = new Array(7).fill(0);
    let totalMs = 0, podcastMs = 0, records = 0, plays = 0;
    let skipped = 0, shuffled = 0, incognito = 0, hasBehaviorData = false;
    let first = null, last = null, firstTrack = null;

    function addRecord(raw) {
      const r = normalize(raw);
      if (!r || isNaN(r.date)) return;
      if (r.kind === "podcast") { podcastMs += r.ms; add(showMs, r.show, r.ms); return; }

      const d = r.date, year = d.getFullYear(), key = trackKey(r.track, r.artist);
      records++;
      totalMs += r.ms;
      timeline.add(r);
      add(artistMs, r.artist, r.ms);
      add(trackMs, key, r.ms);
      add(yearMs, year, r.ms);
      add(yearStreams, year, 1);
      if (!yearArtistMs.has(year)) yearArtistMs.set(year, new Map());
      add(yearArtistMs.get(year), r.artist, r.ms);
      if (r.country) {
        if (!yearCountries.has(year)) yearCountries.set(year, new Map());
        add(yearCountries.get(year), r.country, 1);
      }
      const month = year * 12 + d.getMonth();
      if (!monthArtistMs.has(month)) monthArtistMs.set(month, new Map());
      add(monthArtistMs.get(month), r.artist, r.ms);
      hourMs[d.getHours()] += r.ms;
      weekdayMs[(d.getDay() + 6) % 7] += r.ms;
      add(dayMs, dayKey(d), r.ms);
      add(trackStarts, key, 1);
      add(artistStarts, r.artist, 1);

      if (r.skipped !== null) {
        hasBehaviorData = true;
        if (r.skipped) { skipped++; add(trackSkips, key, 1); add(artistSkips, r.artist, 1); add(yearSkips, year, 1); }
        if (r.shuffle) shuffled++;
        if (r.incognito) incognito++;
      }
      if (!first || d < first) { first = d; firstTrack = key; }
      if (!last || d > last) last = d;

      if (r.ms >= MIN_PLAY_MS) {
        plays++;
        add(yearPlays, year, 1);
        add(artistPlays, r.artist, 1);
        add(trackPlays, key, 1);
        if (NIGHT_HOURS.includes(d.getHours())) add(trackNight, key, 1);
        if (MORNING_HOURS.includes(d.getHours())) add(trackMorning, key, 1);
        if (!artistYears.has(r.artist)) artistYears.set(r.artist, new Set());
        artistYears.get(r.artist).add(year);
        if (!yearTrackPlays.has(year)) yearTrackPlays.set(year, new Map());
        add(yearTrackPlays.get(year), key, 1);
        add(dayTrackPlays, `${dayKey(d)}\u0001${key}`, 1);
      }
    }

    /** How each frequently played song was listened to: when, over how many years, and how bursty. */
    function buildTrackProfiles() {
      const candidates = topEntries(trackPlays, MAX_PROFILES).filter(([, n]) => n >= MIN_PROFILE_PLAYS);
      const wanted = new Set(candidates.map(([key]) => key));
      const maxDay = new Map();
      for (const [k, n] of dayTrackPlays) {
        const key = k.slice(k.indexOf("\u0001") + 1);
        if (wanted.has(key) && n > (maxDay.get(key) || 0)) maxDay.set(key, n);
      }
      return candidates.map(([key, plays]) => {
        let years = 0, peakYear = null, peakPlays = 0;
        for (const [year, tracks] of yearTrackPlays) {
          const n = tracks.get(key);
          if (!n) continue;
          years++;
          if (n > peakPlays) { peakPlays = n; peakYear = year; }
        }
        return {
          ...splitKey(key),
          plays,
          starts: trackStarts.get(key),
          skips: trackSkips.get(key) || 0,
          years,
          peakYear,
          peakYearShare: peakPlays / plays,
          maxDay: maxDay.get(key) || 0,
          night: trackNight.get(key) || 0,
          morning: trackMorning.get(key) || 0
        };
      });
    }

    function finish() {
      if (records === 0) return null;
      const track = splitKey;
      // "Recent" means the 12 calendar months up to and including the last stream.
      const lastMonth = last.getFullYear() * 12 + last.getMonth();
      const recentArtistMs = new Map();
      for (const [month, artists] of monthArtistMs) {
        if (month <= lastMonth - 12) continue;
        for (const [a, ms] of artists) add(recentArtistMs, a, ms);
      }
      const trackProfiles = buildTrackProfiles();
      const newArtistsByYear = new Map();
      for (const years of artistYears.values()) add(newArtistsByYear, Math.min(...years), 1);
      const biggestDay = topEntries(dayMs, 1)[0];
      const longest = topEntries(trackMs, 1)[0];

      return {
        first: dayKey(first),
        last: dayKey(last),
        firstTrack: track(firstTrack),
        totalHours: hours(totalMs),
        podcastHours: hours(podcastMs),
        records,
        plays,
        distinctArtists: artistMs.size,
        distinctTracks: trackMs.size,
        hasBehaviorData,
        skipRate: hasBehaviorData ? skipped / records : null,
        shuffleRate: hasBehaviorData ? shuffled / records : null,
        incognito: hasBehaviorData ? incognito : null,
        top10Share: topEntries(artistMs, 10).reduce((s, [, ms]) => s + ms, 0) / totalMs,
        nightShare: NIGHT_HOURS.reduce((s, h) => s + hourMs[h], 0) / totalMs,
        hours: hourMs.map(hours),
        weekdays: weekdayMs.map(hours),
        biggestDay: { day: biggestDay[0], hours: hours(biggestDay[1]) },
        longestTrack: { ...track(longest[0]), hours: hours(longest[1]) },
        years: [...yearMs.keys()].sort((a, b) => a - b).map(year => ({
          year,
          hours: hours(yearMs.get(year)),
          topArtists: topEntries(yearArtistMs.get(year), 10).map(([name, ms]) => ({ name, hours: hours(ms) })),
          topTrack: yearTrackPlays.has(year) ? track(topEntries(yearTrackPlays.get(year), 1)[0][0]) : null,
          topTracks: yearTrackPlays.has(year) ? topEntries(yearTrackPlays.get(year), 5).map(([key, n]) => ({ ...track(key), plays: n })) : [],
          streams: yearStreams.get(year),
          plays: yearPlays.get(year) || 0,
          skipRate: hasBehaviorData ? (yearSkips.get(year) || 0) / yearStreams.get(year) : null,
          distinctArtists: yearArtistMs.get(year).size,
          newArtists: newArtistsByYear.get(year) || 0,
          countries: yearCountries.has(year) ? topEntries(yearCountries.get(year), 5).map(([code, streams]) => ({ code, streams })) : []
        })),
        topArtists: topEntries(artistMs, 150).map(([name, ms]) => ({
          name, hours: hours(ms), plays: artistPlays.get(name) || 0, years: artistYears.has(name) ? artistYears.get(name).size : 0
        })),
        topTracks: topEntries(trackPlays, 50).map(([key, n]) => ({ ...track(key), plays: n, hours: hours(trackMs.get(key)) })),
        recentArtists: topEntries(recentArtistMs, 15).map(([name, ms]) => ({ name, hours: hours(ms) })),
        obsessions: topEntries(dayTrackPlays, 5).map(([k, n]) => { const [day, key] = k.split("\u0001"); return { day, ...track(key), plays: n }; }),
        skippedTracks: topEntries(trackSkips, 15).map(([key, n]) => ({ ...track(key), skips: n, starts: trackStarts.get(key), rate: n / trackStarts.get(key) })),
        skippedArtists: [...artistStarts.entries()]
          .filter(([, starts]) => starts >= MIN_ARTIST_STARTS_FOR_SKIPS)
          .map(([name, starts]) => ({ name, starts, skips: artistSkips.get(name) || 0, rate: (artistSkips.get(name) || 0) / starts }))
          .sort((a, b) => b.rate - a.rate)
          .slice(0, 15),
        trackProfiles,
        shows: topEntries(showMs, 8).map(([name, ms]) => ({ name, hours: hours(ms) }))
      };
    }

    return { addRecord, finish, timeline: timeline.build };
  }

  return { createAggregator, normalize, isHistoryFile, dayNumber, calendarOf, MIN_PLAY_MS, MIN_ARTIST_STARTS_FOR_SKIPS, MIN_PROFILE_PLAYS };
});
