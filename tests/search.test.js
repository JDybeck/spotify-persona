const test = require("node:test");
const assert = require("node:assert/strict");
const { createAggregator } = require("../src/analyze.js");
const { search, detail, fold } = require("../src/search.js");

// Local-time timestamps, so day buckets are predictable in any time zone.
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0).toISOString();

function record(ts, artist, track, album, ms = 200000) {
  return {
    ts, ms_played: ms, master_metadata_track_name: track, master_metadata_album_artist_name: artist,
    master_metadata_album_album_name: album, reason_end: "trackdone", skipped: false
  };
}

function build() {
  const agg = createAggregator();
  const add = (n, ...args) => { for (let i = 0; i < n; i++) agg.addRecord(record(...args)); };
  add(3, at(2010, 7, 24), "deadmau5", "Strobe", "For Lack of a Better Name");
  add(5, at(2012, 1, 2), "deadmau5", "Strobe", "For Lack of a Better Name");
  add(2, at(2012, 1, 3), "deadmau5", "Ghosts 'n' Stuff", "For Lack of a Better Name");
  add(1, at(2013, 5, 5), "deadmau5", "Raise Your Weapon", "4x4=12");
  add(4, at(2014, 3, 3), "Tiësto", "Red Lights", "A Town Called Paradise");
  add(2, at(2015, 3, 3), "Strobe Lights Band", "Shine", "Glow");
  agg.addRecord(record(at(2016, 1, 1), "Skipped Artist", "Never Played", "Nope", 1000));
  return agg.timeline();
}

test("fold strips case and accents", () => {
  assert.equal(fold("Tiësto"), "tiesto");
  assert.equal(fold("Håkan Hellström"), "hakan hellstrom");
});

test("search finds artists, songs and albums, prefix matches first", () => {
  const t = build();
  const r = search(t, "strobe");
  assert.deepEqual(r.artists.map(a => a.name), ["Strobe Lights Band"]);
  assert.deepEqual(r.tracks.map(x => [x.name, x.by, x.plays]), [["Strobe", "deadmau5", 8]]);
  assert.deepEqual(r.albums, []);
  const byPrefix = search(t, "s");
  assert.deepEqual(byPrefix, { artists: [], tracks: [], albums: [] }, "queries shorter than two characters return nothing");
});

test("an exact name beats a prefix match, ignoring a leading 'the'", () => {
  const agg = createAggregator();
  const add = (n, artist) => { for (let i = 0; i < n; i++) agg.addRecord(record(at(2020, 1, 1 + i), artist, "Song", "Album")); };
  add(20, "The Midnight");
  add(15, "Midnight Kids");
  add(2, "Before Midnight");
  const r = search(agg.timeline(), "midnight");
  assert.deepEqual(r.artists.map(a => a.name), ["The Midnight", "Midnight Kids", "Before Midnight"]);
});

test("search ignores accents and matches every word in any order", () => {
  const t = build();
  assert.equal(search(t, "tiesto").artists[0].name, "Tiësto");
  assert.equal(search(t, "better lack").albums[0].name, "For Lack of a Better Name");
  assert.equal(search(t, "never played").tracks.length, 0, "things never played for 30 seconds are left out");
});

test("detail for an artist covers totals, dates, years and top lists", () => {
  const t = build();
  const d = detail(t, "artist", search(t, "deadmau5").artists[0].id);
  assert.equal(d.plays, 11);
  assert.equal(d.rank, 1);
  assert.equal(d.first, "2010-07-24");
  assert.equal(d.last, "2013-05-05");
  assert.deepEqual(d.peakDay, { date: "2012-01-02", plays: 5 });
  assert.deepEqual(d.perYear.map(y => [y.year, y.plays]), [[2010, 3], [2011, 0], [2012, 7], [2013, 1]], "empty years in between are filled in");
  assert.deepEqual(d.topTracks.map(x => [x.track, x.plays]), [["Strobe", 8], ["Ghosts 'n' Stuff", 2], ["Raise Your Weapon", 1]]);
  assert.deepEqual(d.topAlbums.map(x => x.album), ["For Lack of a Better Name", "4x4=12"]);
});

test("detail for a song and an album", () => {
  const t = build();
  const song = detail(t, "track", search(t, "red lights").tracks[0].id);
  assert.deepEqual([song.name, song.by, song.plays, song.topTracks.length, song.topAlbums.length], ["Red Lights", "Tiësto", 4, 0, 0]);
  const album = detail(t, "album", search(t, "lack of").albums[0].id);
  assert.deepEqual([album.name, album.by, album.plays], ["For Lack of a Better Name", "deadmau5", 10]);
  assert.deepEqual(album.topTracks.map(x => x.track), ["Strobe", "Ghosts 'n' Stuff"]);
});

test("detail returns null for something never played", () => {
  const t = build();
  const id = t.artistNames.indexOf("Skipped Artist");
  assert.equal(detail(t, "artist", id), null);
});
