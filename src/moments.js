// Moments from the per-hour timeline: on this day, artist discoveries and yearly artist ranks.
// Pure logic with no DOM access, shared by the page and the Node tests.
(function (root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const api = factory(isNode ? require("./analyze.js") : root.SpotifyPersona.analyze);
  if (isNode) module.exports = api;
  else root.SpotifyPersona.moments = api;
})(typeof self !== "undefined" ? self : this, function ({ calendarOf }) {
  const MINUTE_MS = 60000;
  const CLICK_PLAYS = 10;

  /** What was played on a calendar date (month 1-12, date 1-31) in every year, newest year first. */
  function onThisDay(timeline, month, date, topN = 3) {
    const calendar = calendarOf(timeline);
    const years = new Map();
    for (let i = 0; i < timeline.slot.length; i++) {
      const c = calendar(timeline.slot[i]);
      if (c.month !== month || c.date !== date) continue;
      let y = years.get(c.year);
      if (!y) years.set(c.year, y = { ms: 0, plays: 0, tracks: new Map() });
      y.ms += timeline.ms[i];
      y.plays += timeline.plays[i];
      const t = timeline.track[i];
      y.tracks.set(t, (y.tracks.get(t) || 0) + timeline.plays[i]);
    }
    return [...years.entries()]
      .filter(([, y]) => y.plays > 0)
      .sort((a, b) => b[0] - a[0])
      .map(([year, y]) => ({
        year,
        minutes: y.ms / MINUTE_MS,
        plays: y.plays,
        topTracks: [...y.tracks.entries()]
          .filter(([, n]) => n > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, topN)
          .map(([t, n]) => ({ track: timeline.trackNames[t], artist: timeline.artistNames[timeline.trackArtist[t]], plays: n }))
      }));
  }

  /**
   * For each named artist: the first play (date and song) and the month they "clicked",
   * the first calendar month with at least 10 plays.
   */
  function discoveries(timeline, names) {
    const calendar = calendarOf(timeline);
    const wanted = new Set(names);
    const idByName = new Map();
    timeline.artistNames.forEach((name, id) => { if (wanted.has(name)) idByName.set(name, id); });
    const wantedIds = new Set(idByName.values());
    const firstSlot = new Map(), firstTrack = new Map(), monthPlays = new Map();
    for (let i = 0; i < timeline.slot.length; i++) {
      if (timeline.plays[i] === 0) continue;
      const t = timeline.track[i], a = timeline.trackArtist[t];
      if (!wantedIds.has(a)) continue;
      const s = timeline.slot[i];
      if (!firstSlot.has(a) || s < firstSlot.get(a)) { firstSlot.set(a, s); firstTrack.set(a, t); }
      const c = calendar(s);
      const month = c.year * 12 + c.month - 1;
      let months = monthPlays.get(a);
      if (!months) monthPlays.set(a, months = new Map());
      months.set(month, (months.get(month) || 0) + timeline.plays[i]);
    }
    return names.map(name => {
      const a = idByName.get(name);
      if (a === undefined || !firstSlot.has(a)) return null;
      const first = calendar(firstSlot.get(a));
      const firstMonth = first.year * 12 + first.month - 1;
      const clickMonth = [...monthPlays.get(a).entries()]
        .filter(([, n]) => n >= CLICK_PLAYS)
        .reduce((min, [m]) => (min === null || m < min ? m : min), null);
      return {
        name,
        first: first.iso,
        firstTrack: timeline.trackNames[firstTrack.get(a)],
        clicked: clickMonth === null ? null : `${Math.floor(clickMonth / 12)}-${String(clickMonth % 12 + 1).padStart(2, "0")}`,
        monthsToClick: clickMonth === null ? null : clickMonth - firstMonth
      };
    }).filter(Boolean);
  }

  /**
   * Yearly rank (by time played) of the artists that made a yearly top 3, the biggest ones first.
   * A rank is null for years the artist was not played at all.
   */
  function artistRanks(timeline, maxArtists = 10) {
    const calendar = calendarOf(timeline);
    const byYear = new Map();
    for (let i = 0; i < timeline.slot.length; i++) {
      const year = calendar(timeline.slot[i]).year;
      let artists = byYear.get(year);
      if (!artists) byYear.set(year, artists = new Map());
      const a = timeline.trackArtist[timeline.track[i]];
      artists.set(a, (artists.get(a) || 0) + timeline.ms[i]);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    const rankByYear = new Map(), total = new Map(), picked = new Set();
    for (const year of years) {
      const order = [...byYear.get(year).entries()].sort((a, b) => b[1] - a[1]);
      const ranks = new Map();
      order.forEach(([a, ms], i) => {
        ranks.set(a, i + 1);
        total.set(a, (total.get(a) || 0) + ms);
        if (i < 3) picked.add(a);
      });
      rankByYear.set(year, ranks);
    }
    const artists = [...picked]
      .sort((a, b) => total.get(b) - total.get(a))
      .slice(0, maxArtists)
      .map(a => ({ name: timeline.artistNames[a], ranks: years.map(y => rankByYear.get(y).get(a) || null) }));
    return { years, artists };
  }

  return { onThisDay, discoveries, artistRanks, CLICK_PLAYS };
});
