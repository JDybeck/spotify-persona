// Song vibes inferred from how a song is actually listened to, plus energy from the artist's genre.
// No audio analysis: Spotify's export has none, and its audio-features API is closed to new apps.
(function (root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const api = factory(isNode ? require("./genres.js") : root.SpotifyPersona.genres);
  if (isNode) module.exports = api;
  else root.SpotifyPersona.vibes = api;
})(typeof self !== "undefined" ? self : this, function ({ genreOf }) {
  const ENERGY = {
    heavy:   { label: "Heavy",   genres: ["core", "metal"] },
    upbeat:  { label: "Upbeat",  genres: ["edm", "pop", "punk"] },
    anthem:  { label: "Anthems", genres: ["rock"] },
    groove:  { label: "Groove",  genres: ["hiphop"] },
    calm:    { label: "Calm",    genres: ["chill", "indie", "score"] }
  };
  const energyOfGenre = new Map();
  for (const [key, e] of Object.entries(ENERGY)) for (const g of e.genres) energyOfGenre.set(g, key);

  function energyOf(artist) {
    const genre = genreOf(artist);
    return genre ? energyOfGenre.get(genre) : null;
  }

  const SONGS_PER_VIBE = 5;
  const PLAYLIST_SIZE = 50;

  // Each vibe decides whether a song profile qualifies and how strongly, so the strongest examples are shown.
  const VIBES = [
    {
      // Most all-time favourites are comfort songs by definition, so this one gets no per-song tag.
      key: "comfort", name: "Comfort songs", tag: null,
      blurb: "The ones that keep coming back, year after year.",
      test: (p, ctx) => p.years >= ctx.comfortYears,
      score: p => p.years * 1000 + p.plays,
      detail: p => `${p.years} different years`
    },
    {
      key: "night", name: "After dark", tag: "night",
      blurb: "Mostly played between 22:00 and 04:00.",
      test: p => p.night / p.plays >= 0.5,
      score: p => p.night,
      detail: p => `${Math.round(p.night / p.plays * 100)}% at night`
    },
    {
      key: "morning", name: "Morning fuel", tag: "morning",
      blurb: "What gets you out of bed, played between 05:00 and 10:00.",
      test: p => p.morning / p.plays >= 0.35,
      score: p => p.morning,
      detail: p => `${Math.round(p.morning / p.plays * 100)}% in the morning`
    },
    {
      key: "obsession", name: "On repeat", tag: "repeat",
      blurb: "Songs you looped for a whole day.",
      test: p => p.maxDay >= 10,
      score: p => p.maxDay,
      detail: p => `${p.maxDay}× in one day`
    },
    {
      key: "phase", name: "It was a phase", tag: "phase",
      blurb: "Huge for one year, then barely touched again.",
      test: (p, ctx) => p.peakYearShare >= 0.8 && p.plays >= 25 && p.peakYear !== ctx.lastYear,
      score: p => p.plays,
      detail: p => `${Math.round(p.peakYearShare * 100)}% of plays in ${p.peakYear}`
    },
    {
      key: "skipbait", name: "Skip bait", tag: "skip bait",
      blurb: "You keep starting them. You keep skipping them.",
      test: (p, ctx) => ctx.hasBehaviorData && p.starts >= 20 && p.skips / p.starts >= 0.5,
      score: p => p.skips,
      detail: p => `skipped ${Math.round(p.skips / p.starts * 100)}% of the time`
    }
  ];

  const keyOf = (track, artist) => `${track}\u0000${artist}`;

  /** Energy mix (by plays) and the songs that best fit each vibe, plus every vibe tag per song. */
  function songVibes(stats) {
    const profiles = stats.trackProfiles || [];
    const span = stats.years.length;
    const ctx = {
      comfortYears: Math.max(4, Math.ceil(span * 0.5)),
      lastYear: span ? stats.years[span - 1].year : null,
      hasBehaviorData: stats.hasBehaviorData
    };

    const energyPlays = new Map();
    let taggedPlays = 0;
    for (const p of profiles) {
      const e = energyOf(p.artist);
      if (!e) continue;
      energyPlays.set(e, (energyPlays.get(e) || 0) + p.plays);
      taggedPlays += p.plays;
    }
    const energy = [...energyPlays.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, plays]) => ({ key, label: ENERGY[key].label, share: plays / taggedPlays }))
      .filter(e => e.share >= 0.01);

    const tags = {};
    const vibes = VIBES.map(v => {
      const matches = profiles.filter(p => v.test(p, ctx));
      if (v.tag) for (const p of matches) (tags[keyOf(p.track, p.artist)] = tags[keyOf(p.track, p.artist)] || []).push(v.tag);
      const ranked = matches.sort((a, b) => v.score(b) - v.score(a));
      const songs = ranked
        .slice(0, SONGS_PER_VIBE)
        .map(p => ({ track: p.track, artist: p.artist, detail: v.detail(p), energy: energyOf(p.artist) }));
      // The card shows the top five; a copied playlist gets every match, up to a playlist-sized cap.
      const playlist = ranked.slice(0, PLAYLIST_SIZE).map(p => ({ track: p.track, artist: p.artist }));
      return { key: v.key, name: v.name, blurb: v.blurb, songs, playlist };
    }).filter(v => v.songs.length > 0);

    return { energy, vibes, tags };
  }

  return { songVibes, energyOf, ENERGY, VIBES, keyOf };
});
