const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPersona } = require("../src/persona.js");
const { tattooIdeas, initials, roman, inkDate, IDEA_COUNT } = require("../src/tattoos.js");

const YEARS = [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];

function stats(overrides = {}) {
  const topArtists = [
    { name: "Architects", hours: 300, plays: 3000, years: 9 },
    { name: "Bring Me The Horizon", hours: 200, plays: 2000, years: 8 },
    { name: "deadmau5", hours: 120, plays: 900, years: 5 },
    { name: "Avicii", hours: 80, plays: 700, years: 7 },
    { name: "Unknown Band", hours: 20, plays: 100, years: 1 }
  ];
  return {
    first: "2016-02-03",
    last: "2024-12-30",
    firstTrack: { track: "Opener", artist: "Avicii" },
    totalHours: 1000,
    podcastHours: 0,
    records: 20000,
    plays: 15000,
    distinctArtists: 900,
    distinctTracks: 5000,
    hasBehaviorData: true,
    skipRate: 0.2,
    shuffleRate: 0.4,
    top10Share: 0.7,
    nightShare: 0.4,
    hours: Array.from({ length: 24 }, (_, h) => (h === 23 ? 90 : 20)),
    weekdays: [1, 1, 1, 1, 1, 1, 1],
    biggestDay: { day: "2020-01-01", hours: 10 },
    longestTrack: { track: "Doomsday", artist: "Architects", hours: 30 },
    years: YEARS.map((year, i) => ({
      year, hours: 50 + i * 10,
      topArtists: i < 5 ? [{ name: "Architects", hours: 30 }, { name: "deadmau5", hours: 10 }] : [{ name: "deadmau5", hours: 30 }, { name: "Avicii", hours: 20 }]
    })),
    topArtists,
    topTracks: [{ track: "Doomsday", artist: "Architects", plays: 400, hours: 30 }],
    recentArtists: [{ name: "Bring Me The Horizon", hours: 40 }],
    obsessions: [{ day: "2020-03-14", track: "Doomsday", artist: "Architects", plays: 23 }],
    skippedTracks: [],
    skippedArtists: [],
    trackProfiles: [
      { track: "Doomsday", artist: "Architects", plays: 400, starts: 420, skips: 5, years: 7, peakYear: 2018, peakYearShare: 0.3, maxDay: 23, night: 200, morning: 10 },
      { track: "Levels", artist: "Avicii", plays: 60, starts: 70, skips: 2, years: 1, peakYear: 2017, peakYearShare: 1, maxDay: 3, night: 0, morning: 0 }
    ],
    shows: [],
    habits: {
      streaks: { longest: { days: 128, from: "2019-01-01", to: "2019-05-08" } },
      comebacks: [{ track: "Levels", artist: "Avicii", lastYear: 2017, backYear: 2022, silentYears: 4, playsBefore: 40, playsAfter: 20 }],
      seasons: { seasonal: [{ name: "deadmau5", plays: 400, season: "summer", share: 0.6 }] },
      newYear: [{ year: 2024, track: "Doomsday", artist: "Architects", date: "2024-01-01", time: "00:03" }],
      sessions: { longest: { date: "2021-06-01", startTime: "20:00", hours: 7.4, streams: 100 } }
    },
    ...overrides
  };
}

test("helpers make tattoo-friendly text", () => {
  assert.equal(initials("Bring Me The Horizon"), "BMTH");
  assert.equal(initials("deadmau5"), "DEA");
  assert.equal(initials("Axwell /\\ Ingrosso"), "AI");
  assert.equal(roman(128), "CXXVIII");
  assert.equal(roman(2024), "MMXXIV");
  assert.equal(inkDate("2020-03-14"), "14.03.20");
});

test("a full history gives exactly 15 distinct ideas, each tied to data", () => {
  const s = stats();
  const result = tattooIdeas(s, buildPersona(s));
  assert.equal(result.ideas.length, IDEA_COUNT);
  assert.equal(new Set(result.ideas.map(i => i.key)).size, IDEA_COUNT);
  for (const idea of result.ideas) {
    for (const field of ["title", "basis", "design", "style", "placement", "size"]) {
      assert.ok(typeof idea[field] === "string" && idea[field].length > 0, `${idea.key}.${field}`);
      assert.doesNotMatch(idea[field], /undefined|NaN|null/, `${idea.key}.${field}`);
    }
  }
  assert.equal(result.ideas[0].key, "headliner");
  assert.match(result.ideas[0].design, /"ARCHITECTS"/);
});

test("theme, artist and song come from the history", () => {
  const s = stats();
  const result = tattooIdeas(s, buildPersona(s));
  assert.equal(result.artist.name, "Architects");
  assert.match(result.artist.why, /30% of everything/);
  assert.equal(result.song.track, "Doomsday");
  assert.match(result.song.why, /7 different years/);
  assert.match(result.theme.text, /Metalcore/);
  assert.equal(result.theme.style, "Neo-traditional");
});

test("specific ideas use the right numbers", () => {
  const s = stats();
  const byKey = Object.fromEntries(tattooIdeas(s, buildPersona(s)).ideas.map(i => [i.key, i]));
  assert.equal(byKey.clock.title, "23:00");
  assert.match(byKey.clock.design, /crescent moon/);
  assert.equal(byKey.tally.design.split(",")[0], "4 groups of five tally marks plus 3 single marks");
  assert.equal(byKey.streak.title, "CXXVIII");
  assert.equal(byKey.equalizer.bars.length, YEARS.length);
  assert.match(byKey.comeback.basis, /4 years/);
});

test("a thin basic export still fills the list without crashing", () => {
  const s = stats({
    habits: undefined, hasBehaviorData: false, skipRate: null, shuffleRate: null,
    years: [{ year: 2024, hours: 100, topArtists: [{ name: "Unknown Band", hours: 20 }] }],
    topArtists: [{ name: "Unknown Band", hours: 20, plays: 100, years: 1 }],
    recentArtists: [], trackProfiles: [], obsessions: []
  });
  const result = tattooIdeas(s, buildPersona(s));
  assert.ok(result.ideas.length >= 6);
  assert.match(result.theme.text, /No single genre/);
  for (const idea of result.ideas) assert.doesNotMatch(`${idea.basis} ${idea.design}`, /undefined|NaN/);
});

test("tally text reads right for small counts", () => {
  const s = stats({ obsessions: [{ day: "2020-03-14", track: "Doomsday", artist: "Architects", plays: 6 }] });
  const tally = tattooIdeas(s, buildPersona(s)).ideas.find(i => i.key === "tally");
  assert.match(tally.design, /^1 group of five tally marks plus 1 single mark,/);
});

test("no artists means no ideas", () => {
  assert.equal(tattooIdeas({ topArtists: [] }, {}), null);
});
