const test = require("node:test");
const assert = require("node:assert/strict");
const { songVibes, energyOf, keyOf } = require("../src/vibes.js");

function profile(overrides = {}) {
  return {
    track: "Song", artist: "Unknown Band", plays: 30, starts: 40, skips: 2,
    years: 1, peakYear: 2020, peakYearShare: 0.5, maxDay: 2, night: 0, morning: 0,
    ...overrides
  };
}

function stats(profiles, overrides = {}) {
  return {
    years: Array.from({ length: 10 }, (_, i) => ({ year: 2015 + i })),
    hasBehaviorData: true,
    trackProfiles: profiles,
    ...overrides
  };
}

test("energyOf maps artist genres to energy and unknown artists to null", () => {
  assert.equal(energyOf("Architects"), "heavy");
  assert.equal(energyOf("The Midnight"), "calm");
  assert.equal(energyOf("Avicii"), "upbeat");
  assert.equal(energyOf("Unknown Band"), null);
});

test("energy mix is weighted by plays over tagged songs only", () => {
  const { energy } = songVibes(stats([
    profile({ artist: "Architects", plays: 30 }),
    profile({ artist: "Avicii", plays: 10 }),
    profile({ artist: "Unknown Band", plays: 100 })
  ]));
  assert.deepEqual(energy.map(e => [e.key, e.share]), [["heavy", 0.75], ["upbeat", 0.25]]);
});

test("energies under 1% are left out", () => {
  const { energy } = songVibes(stats([
    profile({ artist: "Architects", plays: 1000 }),
    profile({ artist: "Drake", plays: 5 })
  ]));
  assert.deepEqual(energy.map(e => e.key), ["heavy"]);
});

test("songs qualify for vibes from how they were played", () => {
  const { vibes, tags } = songVibes(stats([
    profile({ track: "Old Friend", years: 8 }),
    profile({ track: "Late", night: 20, plays: 30 }),
    profile({ track: "Wake Up", morning: 12, plays: 30 }),
    profile({ track: "Loop", maxDay: 40 }),
    profile({ track: "Fad", peakYearShare: 0.9, peakYear: 2018 }),
    profile({ track: "Current Fad", peakYearShare: 0.9, peakYear: 2024 }),
    profile({ track: "Nope", starts: 60, skips: 45 })
  ]));
  const byKey = Object.fromEntries(vibes.map(v => [v.key, v.songs.map(s => s.track)]));
  assert.deepEqual(byKey.comfort, ["Old Friend"]);
  assert.deepEqual(byKey.night, ["Late"]);
  assert.deepEqual(byKey.morning, ["Wake Up"]);
  assert.deepEqual(byKey.obsession, ["Loop"]);
  assert.deepEqual(byKey.phase, ["Fad"], "a song peaking in the latest year is not a phase yet");
  assert.deepEqual(byKey.skipbait, ["Nope"]);
  assert.deepEqual(tags[keyOf("Loop", "Unknown Band")], ["repeat"]);
  assert.equal(tags[keyOf("Old Friend", "Unknown Band")], undefined, "comfort songs get no per-song tag");
});

test("a vibe's playlist holds every match, while the card shows five", () => {
  const night = Array.from({ length: 8 }, (_, i) => profile({ track: `Night ${i}`, night: 20 + i, plays: 30 }));
  const v = songVibes(stats(night)).vibes.find(x => x.key === "night");
  assert.equal(v.songs.length, 5);
  assert.equal(v.playlist.length, 8);
  assert.deepEqual(v.playlist[0], { track: "Night 7", artist: "Unknown Band" }, "strongest match first");
});

test("skip bait needs skip data and empty vibes are dropped", () => {
  const { vibes } = songVibes(stats([profile({ starts: 60, skips: 45 })], { hasBehaviorData: false }));
  assert.deepEqual(vibes, []);
});

test("works without any profiles", () => {
  assert.deepEqual(songVibes(stats([])), { energy: [], vibes: [], tags: {} });
});
