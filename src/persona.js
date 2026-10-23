// Derives the "who you are" layer from aggregated stats: archetype, traits, genre mix, eras and receipts.
// Pure logic with no DOM access, shared by the Web Worker and the Node tests.
(function (root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const api = factory(isNode ? require("./genres.js") : root.SpotifyPersona.genres);
  if (isNode) module.exports = api;
  else root.SpotifyPersona.persona = api;
})(typeof self !== "undefined" ? self : this, function ({ GENRES, genreOf }) {
  const MIN_GENRE_COVERAGE = 0.25;

  // Each habit is scored against a typical listener, so the trait that stands out most names the archetype.
  const HABITS = {
    loyalty:   { name: "Loyalty",        noun: "Loyalist",        baseline: 0.5,  blurb: "Once an artist is in, they stay in for years." },
    explorer:  { name: "Explorer",       noun: "Explorer",        baseline: 0.75, blurb: "Your library is a map, and you keep drawing new edges on it." },
    night:     { name: "Night owl",      noun: "Night Owl",       baseline: 0.15, blurb: "The music gets louder when the lights go out." },
    skipper:   { name: "Restless thumb", noun: "Critic",          baseline: 0.25, blurb: "A song gets about ten seconds to prove itself." },
    shuffle:   { name: "Shuffle addict", noun: "Chaos Agent",     baseline: 0.5,  blurb: "Tracklists are suggestions. Shuffle is the law." },
    obsession: { name: "Obsessive",      noun: "Repeat Offender", baseline: 0.3,  blurb: "When a song hits, it hits fifty times in a row." }
  };

  const pct = v => `${Math.round(v * 100)}%`;
  const fmt = n => Math.round(n).toLocaleString("sv-SE");
  // Lowercases a label for use mid-sentence, but leaves acronyms like "EDM" alone.
  const lowerFirstWord = s => /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;

  /** Hours per genre over the top artists, plus how much of all listening the dictionary could tag. */
  function genreMix(stats) {
    const byGenre = new Map();
    let tagged = 0;
    for (const a of stats.topArtists) {
      const g = genreOf(a.name);
      if (!g) continue;
      byGenre.set(g, (byGenre.get(g) || 0) + a.hours);
      tagged += a.hours;
    }
    const shares = [...byGenre.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, h]) => ({ key, label: GENRES[key].label, hours: h, share: tagged ? h / tagged : 0 }));
    return { shares, taggedHours: tagged, coverage: stats.totalHours ? tagged / stats.totalHours : 0 };
  }

  function habitScores(stats) {
    const top20 = stats.topArtists.slice(0, 20);
    const span = stats.years.length;
    const loyalYears = Math.max(2, Math.ceil(span / 2));
    const obsession = stats.obsessions[0];
    const scores = {
      loyalty: top20.length ? top20.filter(a => a.years >= loyalYears).length / top20.length : 0,
      explorer: 1 - stats.top10Share,
      night: stats.nightShare,
      skipper: stats.skipRate,
      shuffle: stats.shuffleRate,
      obsession: obsession ? Math.min(1, obsession.plays / 100) : 0
    };
    // A single year of history says nothing about loyalty.
    if (span < 3) scores.loyalty = null;
    return scores;
  }

  function traitText(key, stats, value) {
    const o = stats.obsessions[0];
    switch (key) {
      case "loyalty": return `${Math.round(value * 20)} of your top 20 artists have stayed in rotation for at least half of your ${stats.years.length} years on Spotify.`;
      case "explorer": return `Your top 10 artists are only ${pct(stats.top10Share)} of your listening. ${fmt(stats.distinctArtists - 10)} other artists split the rest.`;
      case "night": return `${pct(value)} of your listening happens between 22:00 and 04:00.`;
      case "skipper": return `You skip ${pct(value)} of what starts. High standards, or a short attention span.`;
      case "shuffle": return `${pct(value)} of streams on shuffle. You trust chaos more than tracklists.`;
      case "obsession": return o ? `${o.plays} plays of "${o.track}" in a single day (${o.day}).` : "";
      default: return "";
    }
  }

  /** Picks the habit that is furthest above a typical listener. */
  function pickHabit(scores) {
    let best = null;
    for (const [key, value] of Object.entries(scores)) {
      if (value === null || value === undefined) continue;
      const ratio = value / HABITS[key].baseline;
      if (!best || ratio > best.ratio) best = { key, ratio };
    }
    return best ? best.key : "explorer";
  }

  function archetype(stats, mix, scores) {
    const habit = pickHabit(scores);
    const known = mix.coverage >= MIN_GENRE_COVERAGE && mix.shares.length > 0;
    const main = known ? GENRES[mix.shares[0].key] : null;
    const second = known && mix.shares[1] ? mix.shares[1] : null;
    const title = [main ? main.word : "Eclectic", HABITS[habit].noun];
    const parts = [
      main ? main.blurb : "Your taste is too wide for any one box, which is a compliment.",
      HABITS[habit].blurb,
      second ? `Your second home is ${lowerFirstWord(second.label)}.` : ""
    ];
    return { title, habit, genre: known ? mix.shares[0].key : null, description: parts.filter(Boolean).join(" ") };
  }

  function dominantGenre(artists) {
    const byGenre = new Map();
    for (const a of artists) {
      const g = genreOf(a.name);
      if (g) byGenre.set(g, (byGenre.get(g) || 0) + a.hours);
    }
    let best = null;
    for (const [g, h] of byGenre) if (!best || h > best[1]) best = [g, h];
    return best ? best[0] : null;
  }

  /** Sums the per-year top artists of an era and derives its headliners and genre. */
  function summarizeEra(years) {
    const artistHours = new Map();
    for (const y of years) for (const a of y.topArtists) artistHours.set(a.name, (artistHours.get(a.name) || 0) + a.hours);
    const artists = [...artistHours.entries()].sort((a, b) => b[1] - a[1]).map(([name, hours]) => ({ name, hours }));
    return { years, from: years[0].year, to: years[years.length - 1].year, genre: dominantGenre(artists), top: artists.slice(0, 3).map(a => a.name) };
  }

  /**
   * Splits the history into eras: consecutive years with the same dominant genre, where untagged years join the era before them.
   * Neighbouring eras with the same headliner are then merged, and a tiny first era (a trial month, say) folds into the next one.
   */
  function eras(stats) {
    const runs = [];
    let currentGenre;
    for (const y of stats.years) {
      const genre = dominantGenre(y.topArtists);
      const current = runs[runs.length - 1];
      if (current && (genre === null || genre === currentGenre)) current.push(y);
      else { runs.push([y]); currentGenre = genre; }
    }

    const maxYearHours = Math.max(...stats.years.map(y => y.hours));
    const runHours = run => run.reduce((s, y) => s + y.hours, 0);
    if (runs.length > 1 && runHours(runs[0]) < maxYearHours * 0.1) runs.splice(0, 2, [...runs[0], ...runs[1]]);

    const merged = [];
    for (const run of runs) {
      const era = summarizeEra(run);
      const previous = merged[merged.length - 1];
      if (previous && previous.top[0] === era.top[0]) merged[merged.length - 1] = summarizeEra([...previous.years, ...run]);
      else merged.push(era);
    }

    return merged.map(era => ({
      from: era.from,
      to: era.to,
      genre: era.genre,
      name: `The ${era.top[0].replace(/^the\s+/i, "")} years`,
      text: `${era.genre ? GENRES[era.genre].label : "All over the place"}. On repeat: ${era.top.join(", ")}.`
    }));
  }

  const LIFE_STAGES = [
    { from: 0, to: 12, name: "Childhood" },
    { from: 13, to: 19, name: "Teenage years" },
    { from: 20, to: 24, name: "Early twenties" },
    { from: 25, to: 29, name: "Late twenties" },
    { from: 30, to: 34, name: "Early thirties" },
    { from: 35, to: 39, name: "Late thirties" },
    { from: 40, to: 49, name: "Forties" },
    { from: 50, to: Infinity, name: "Fifty and up" }
  ];

  /** Age for most of a calendar year: someone born in November is still the younger age at midyear. */
  function ageInYear(year, birth) {
    return year - birth.year - (birth.month >= 7 ? 1 : 0);
  }

  function ageOn(dateString, birth) {
    const [y, m] = dateString.split("-").map(Number);
    return y - birth.year - (m < birth.month ? 1 : 0);
  }

  /** Splits the history into life stages by age, each with its own headliners, song and genre. */
  function lifeStory(stats, birth) {
    const stages = [];
    for (const y of stats.years) {
      const age = ageInYear(y.year, birth);
      if (age < 0) continue;
      const stage = LIFE_STAGES.find(s => age >= s.from && age <= s.to);
      const current = stages[stages.length - 1];
      if (current && current.stage === stage) current.years.push(y);
      else stages.push({ stage, years: [y] });
    }

    const result = stages.map(({ stage, years }) => {
      const era = summarizeEra(years);
      const peakYear = years.reduce((a, b) => (b.hours > a.hours ? b : a));
      return {
        name: stage.name,
        fromAge: ageInYear(era.from, birth),
        toAge: ageInYear(era.to, birth),
        from: era.from,
        to: era.to,
        hours: years.reduce((s, y) => s + y.hours, 0),
        top: era.top,
        genre: era.genre,
        genreLabel: era.genre ? GENRES[era.genre].label : null,
        song: peakYear.topTrack
      };
    });

    // How much of the earliest stage survives in the last 12 months.
    let stillListening = null;
    if (result.length > 1 && stats.recentArtists.length) {
      const early = stages[0];
      const earlyArtists = new Set(early.years.flatMap(y => y.topArtists.map(a => a.name)));
      const kept = stats.recentArtists.filter(a => earlyArtists.has(a.name)).map(a => a.name);
      stillListening = { stage: early.stage.name, count: kept.length, of: stats.recentArtists.length, names: kept.slice(0, 3) };
    }

    return { firstAge: ageOn(stats.first, birth), stages: result, stillListening };
  }

  function receipts(stats) {
    const list = [];
    const now = stats.years[stats.years.length - 1];
    const o = stats.obsessions[0];
    list.push({ big: stats.first.slice(0, 4), text: `Your first ever stream: "${stats.firstTrack.track}" by ${stats.firstTrack.artist}.`, small: stats.first });
    list.push({ big: `${stats.biggestDay.hours} h`, text: "Your biggest single day of listening.", small: stats.biggestDay.day });
    list.push({ big: `${fmt(stats.longestTrack.hours)} h`, text: `of "${stats.longestTrack.track}" alone, the track you have spent the most time with.`, small: stats.longestTrack.artist });
    if (o) list.push({ big: `${o.plays}×`, text: `"${o.track}" in one day.`, small: o.day });
    if (stats.incognito) list.push({ big: fmt(stats.incognito), text: "streams in a private session. We won't ask.", small: "incognito mode" });
    if (now.topArtists.length >= 2) list.push({ big: "#1 & #2", text: `${now.year}: ${now.topArtists[0].name} and ${now.topArtists[1].name}.`, small: `${now.year} so far` });
    list.push({ big: fmt(stats.distinctTracks), text: "different songs played at least once.", small: "unique tracks" });
    if (stats.podcastHours > 0 && stats.shows.length) {
      list.push({ big: `${fmt(stats.podcastHours)} h`, text: `of podcasts, mostly ${stats.shows.slice(0, 2).map(s => s.name).join(" and ")}.`, small: "spoken word" });
    }
    return list;
  }

  /** Builds everything the page shows on top of the raw stats. birth ({ year, month }) is optional. */
  function buildPersona(stats, birth = null) {
    const mix = genreMix(stats);
    const scores = habitScores(stats);
    const traits = Object.entries(scores)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([key, value]) => ({ key, name: HABITS[key].name, value, text: traitText(key, stats, value) }));
    return {
      archetype: archetype(stats, mix, scores),
      traits,
      mix,
      eras: eras(stats),
      receipts: receipts(stats),
      life: birth ? lifeStory(stats, birth) : null
    };
  }

  return { buildPersona, genreMix, habitScores, pickHabit, eras, lifeStory, ageInYear, HABITS };
});
