const test = require("node:test");
const assert = require("node:assert/strict");
const { genreOf } = require("../src/genres.js");
const { buildPersona, genreMix, pickHabit, eras, lifeStory, ageInYear } = require("../src/persona.js");

function stats(overrides = {}) {
  return {
    first: "2015-01-01",
    last: "2024-12-31",
    firstTrack: { track: "First", artist: "Someone" },
    totalHours: 100,
    podcastHours: 0,
    records: 1000,
    plays: 800,
    distinctArtists: 300,
    distinctTracks: 2000,
    hasBehaviorData: true,
    skipRate: 0.2,
    shuffleRate: 0.4,
    incognito: 0,
    top10Share: 0.3,
    nightShare: 0.1,
    hours: new Array(24).fill(1),
    biggestDay: { day: "2020-01-01", hours: 10 },
    longestTrack: { track: "Long", artist: "Someone", hours: 5 },
    years: [
      { year: 2022, hours: 30, topArtists: [{ name: "deadmau5", hours: 20 }, { name: "Avicii", hours: 5 }] },
      { year: 2023, hours: 30, topArtists: [{ name: "Avicii", hours: 20 }, { name: "Unknown Band", hours: 9 }] },
      { year: 2024, hours: 40, topArtists: [{ name: "Architects", hours: 30 }, { name: "Beartooth", hours: 5 }] }
    ],
    topArtists: [
      { name: "deadmau5", hours: 40, plays: 100, years: 3 },
      { name: "Architects", hours: 20, plays: 50, years: 3 },
      { name: "Avicii", hours: 20, plays: 50, years: 2 },
      { name: "Unknown Band", hours: 20, plays: 50, years: 1 }
    ],
    topTracks: [],
    recentArtists: [],
    obsessions: [{ day: "2020-01-01", track: "Loop", artist: "Someone", plays: 10 }],
    skippedTracks: [],
    skippedArtists: [],
    shows: [],
    ...overrides
  };
}

test("genreOf is case-insensitive and returns null for unknown artists", () => {
  assert.equal(genreOf("DEADMAU5"), "edm");
  assert.equal(genreOf("  The Midnight "), "chill");
  assert.equal(genreOf("Definitely Not A Real Band"), null);
});

test("genreMix shares only cover tagged artists and report coverage", () => {
  const mix = genreMix(stats());
  assert.equal(mix.shares[0].key, "edm");
  assert.equal(mix.shares[0].share, 0.75);
  assert.equal(mix.coverage, 0.8);
});

test("pickHabit chooses the habit furthest above its baseline and skips unknowns", () => {
  assert.equal(pickHabit({ night: 0.45, skipper: 0.3, shuffle: null }), "night");
  assert.equal(pickHabit({ loyalty: null, explorer: 0.9, skipper: 0.2 }), "explorer");
});

test("archetype combines dominant genre with the standout habit", () => {
  const p = buildPersona(stats({ nightShare: 0.5 }));
  assert.deepEqual(p.archetype.title, ["Main Stage", "Night Owl"]);
  assert.match(p.archetype.description, /Your second home is metalcore/);
});

test("archetype falls back to Eclectic when too little is tagged", () => {
  const p = buildPersona(stats({ totalHours: 10000 }));
  assert.equal(p.archetype.title[0], "Eclectic");
  assert.equal(p.archetype.genre, null);
});

test("traits without data are left out", () => {
  const p = buildPersona(stats({ skipRate: null, shuffleRate: null, hasBehaviorData: false }));
  const keys = p.traits.map(t => t.key);
  assert.ok(!keys.includes("skipper"));
  assert.ok(!keys.includes("shuffle"));
  assert.ok(keys.includes("night"));
});

test("eras merge consecutive years with the same genre", () => {
  const result = eras(stats());
  assert.equal(result.length, 2);
  assert.deepEqual([result[0].from, result[0].to, result[0].genre], [2022, 2023, "edm"]);
  assert.equal(result[0].name, "The Avicii years");
  assert.deepEqual([result[1].from, result[1].to, result[1].genre], [2024, 2024, "core"]);
});

test("untagged years join the previous era", () => {
  const s = stats({
    years: [
      { year: 2020, hours: 1, topArtists: [{ name: "Avicii", hours: 1 }] },
      { year: 2021, hours: 1, topArtists: [{ name: "Unknown Band", hours: 1 }] }
    ]
  });
  const result = eras(s);
  assert.equal(result.length, 1);
  assert.equal(result[0].to, 2021);
});

test("neighbouring eras with the same headliner merge, and a leading 'The' is not doubled", () => {
  const s = stats({
    years: [
      { year: 2020, hours: 50, topArtists: [{ name: "The Midnight", hours: 30 }, { name: "Jeremy Soule", hours: 10 }] },
      { year: 2021, hours: 50, topArtists: [{ name: "The Midnight", hours: 20 }, { name: "Jeremy Soule", hours: 15 }, { name: "Russell Brower", hours: 10 }] },
      { year: 2022, hours: 50, topArtists: [{ name: "Architects", hours: 40 }] }
    ]
  });
  const result = eras(s);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, "The Midnight years");
  assert.deepEqual([result[0].from, result[0].to, result[0].genre], [2020, 2021, "chill"]);
});

test("a tiny first era folds into the next one", () => {
  const s = stats({
    years: [
      { year: 2009, hours: 2, topArtists: [{ name: "Architects", hours: 2 }] },
      { year: 2010, hours: 100, topArtists: [{ name: "Avicii", hours: 80 }] }
    ]
  });
  const result = eras(s);
  assert.equal(result.length, 1);
  assert.deepEqual([result[0].from, result[0].to, result[0].genre], [2009, 2010, "edm"]);
});

test("ageInYear uses the age someone has for most of the year", () => {
  assert.equal(ageInYear(2009, { year: 1994, month: 11 }), 14);
  assert.equal(ageInYear(2009, { year: 1994, month: 3 }), 15);
});

test("lifeStory splits years into life stages and checks what survived", () => {
  const s = stats({
    first: "2009-03-08",
    years: [
      { year: 2009, hours: 10, topArtists: [{ name: "deadmau5", hours: 8 }], topTrack: { track: "Strobe", artist: "deadmau5" } },
      { year: 2013, hours: 40, topArtists: [{ name: "Avicii", hours: 30 }, { name: "deadmau5", hours: 5 }], topTrack: { track: "Levels", artist: "Avicii" } },
      { year: 2015, hours: 50, topArtists: [{ name: "Architects", hours: 40 }], topTrack: { track: "Doomsday", artist: "Architects" } }
    ],
    recentArtists: [{ name: "Architects", hours: 9 }, { name: "deadmau5", hours: 3 }]
  });
  const story = lifeStory(s, { year: 1994, month: 11 });
  assert.equal(story.firstAge, 14);
  assert.deepEqual(story.stages.map(st => st.name), ["Teenage years", "Early twenties"]);
  const teen = story.stages[0];
  assert.deepEqual([teen.fromAge, teen.toAge, teen.from, teen.to, teen.hours], [14, 18, 2009, 2013, 50]);
  assert.equal(teen.genre, "edm");
  assert.equal(teen.song.track, "Levels", "the song comes from the stage's biggest year");
  assert.deepEqual(story.stillListening, { stage: "Teenage years", count: 1, of: 2, names: ["deadmau5"] });
});

test("years before birth are ignored and no birth date means no life story", () => {
  const s = stats({ years: [{ year: 2020, hours: 5, topArtists: [{ name: "Avicii", hours: 5 }], topTrack: null }] });
  assert.equal(lifeStory(s, { year: 2021, month: 1 }).stages.length, 0);
  assert.equal(buildPersona(s).life, null);
});

test("receipts skip podcast and incognito cards when there is nothing to show", () => {
  const texts = buildPersona(stats()).receipts.map(r => r.small);
  assert.ok(!texts.includes("spoken word"));
  assert.ok(!texts.includes("incognito mode"));
});
