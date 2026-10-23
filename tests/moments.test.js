const test = require("node:test");
const assert = require("node:assert/strict");
const { createAggregator } = require("../src/analyze.js");
const { onThisDay, discoveries, artistRanks, CLICK_PLAYS } = require("../src/moments.js");

// Local-time timestamps, so day buckets are predictable in any time zone.
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

function record(ts, artist, track, ms = 200000) {
  return { ts, ms_played: ms, master_metadata_track_name: track, master_metadata_album_artist_name: artist, reason_end: "trackdone", skipped: false };
}

function timelineOf(records) {
  const agg = createAggregator();
  for (const r of records) agg.addRecord(r);
  return agg.timeline();
}

test("onThisDay collects the same calendar date across years, newest first", () => {
  const t = timelineOf([
    record(at(2019, 10, 24), "A", "One"),
    record(at(2019, 10, 24, 13), "A", "One"),
    record(at(2019, 10, 24, 14), "B", "Two"),
    record(at(2021, 10, 24), "C", "Three"),
    record(at(2021, 10, 25), "D", "Elsewhere"),
    record(at(2022, 10, 24), "E", "Short", 5000)
  ]);
  const days = onThisDay(t, 10, 24);
  assert.deepEqual(days.map(d => d.year), [2021, 2019], "a day with only short streams is left out");
  assert.equal(days[1].plays, 3);
  assert.equal(days[1].minutes, 600000 / 60000);
  assert.deepEqual(days[1].topTracks.map(x => [x.track, x.plays]), [["One", 2], ["Two", 1]]);
});

test("discoveries find the first play and the month an artist clicked", () => {
  const records = [record(at(2015, 3, 2), "Band", "Opener")];
  for (let i = 0; i < CLICK_PLAYS; i++) records.push(record(at(2016, 5, 1 + i), "Band", "Hit"));
  records.push(record(at(2014, 1, 1), "Band", "Too short", 1000));
  records.push(record(at(2020, 1, 1), "Casual", "Once"));
  const result = discoveries(timelineOf(records), ["Band", "Casual", "Missing"]);
  assert.deepEqual(result[0], { name: "Band", first: "2015-03-02", firstTrack: "Opener", clicked: "2016-05", monthsToClick: 14 });
  assert.deepEqual([result[1].name, result[1].clicked, result[1].monthsToClick], ["Casual", null, null]);
  assert.equal(result.length, 2, "artists that were never played are skipped");
});

test("artistRanks ranks yearly top-3 artists in every year", () => {
  const records = [];
  const play = (year, artist, n) => { for (let i = 0; i < n; i++) records.push(record(at(year, 2, 1 + i), artist, "Song")); };
  play(2020, "Big", 5); play(2020, "Mid", 3); play(2020, "Small", 2); play(2020, "Tiny", 1);
  play(2021, "Mid", 6); play(2021, "Tiny", 3);
  const { years, artists } = artistRanks(timelineOf(records));
  assert.deepEqual(years, [2020, 2021]);
  assert.deepEqual(artists.map(a => a.name), ["Mid", "Big", "Tiny", "Small"]);
  assert.deepEqual(artists.find(a => a.name === "Big").ranks, [1, null]);
  assert.deepEqual(artists.find(a => a.name === "Tiny").ranks, [4, 2], "Tiny made the 2021 top 3");
});

test("artistRanks caps the number of artists", () => {
  const records = [];
  for (let y = 2000; y < 2010; y++) for (let a = 0; a < 3; a++) records.push(record(at(y, 1, 1 + a), `Artist ${y}-${a}`, "Song"));
  assert.equal(artistRanks(timelineOf(records), 5).artists.length, 5);
});
