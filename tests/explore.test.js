const test = require("node:test");
const assert = require("node:assert/strict");
const { createAggregator } = require("../src/analyze.js");
const { ranges, query, availableGenres } = require("../src/explore.js");

// Local-time timestamps, so day and hour buckets are predictable in any time zone.
const at = (y, m, d, h) => new Date(y, m - 1, d, h, 0).toISOString();

function record(ts, artist, track, ms = 200000, album = "Album") {
  return {
    ts, ms_played: ms, master_metadata_track_name: track, master_metadata_album_artist_name: artist,
    master_metadata_album_album_name: album, reason_end: "trackdone", skipped: false, shuffle: false
  };
}

function build() {
  const agg = createAggregator();
  agg.addRecord(record(at(2023, 6, 1, 9), "Avicii", "Levels"));
  agg.addRecord(record(at(2023, 6, 1, 9), "Avicii", "Levels"));
  agg.addRecord(record(at(2024, 12, 20, 23), "Architects", "Doomsday", 3600000, "Holy Hell"));
  agg.addRecord(record(at(2024, 12, 30, 23), "Architects", "Gravedigger", 600000, "Holy Hell"));
  agg.addRecord(record(at(2024, 12, 31, 8), "Unknown Band", "Thing", 10000, null));
  return { stats: agg.finish(), timeline: agg.timeline() };
}

test("ranges count back from the last stream and list years newest first", () => {
  const { stats } = build();
  const list = ranges(stats);
  assert.deepEqual(list.map(r => r.key), ["4w", "6m", "12m", "all", "y2024", "y2023"]);
  assert.equal(list[0].to - list[0].from, 27);
});

test("query totals and distinct counts for all time", () => {
  const { stats, timeline } = build();
  const all = query(timeline, ranges(stats).find(r => r.key === "all"));
  assert.equal(all.streams, 4, "the 10-second stream does not count, like Spotify's stats");
  assert.equal(all.tracks, 3);
  assert.equal(all.artists, 2);
  assert.equal(all.minutes, (2 * 200000 + 3600000 + 600000 + 10000) / 60000, "minutes include everything played");
  assert.equal(all.albums, 2, "Album by Avicii and Holy Hell by Architects");
  assert.equal(all.topArtists[0].name, "Architects");
  assert.equal(all.topTracks[0].track, "Levels", "top songs rank by plays");
  assert.equal(all.clock.streams[9], 2);
  assert.equal(all.clock.streams[23], 2);
  assert.equal(all.clock.minutes[23], 70);
});

test("query respects the date range", () => {
  const { stats, timeline } = build();
  const recent = query(timeline, ranges(stats).find(r => r.key === "4w"));
  assert.equal(recent.streams, 2);
  assert.deepEqual(recent.topArtists.map(a => a.name), ["Architects", "Unknown Band"]);
  const y2023 = query(timeline, ranges(stats).find(r => r.key === "y2023"));
  assert.equal(y2023.streams, 2);
  assert.equal(y2023.topTracks[0].plays, 2);
});

test("query can be limited to one genre and reports the genre mix", () => {
  const { stats, timeline } = build();
  const all = ranges(stats).find(r => r.key === "all");
  const heavy = query(timeline, all, "core");
  assert.deepEqual(heavy.topArtists.map(a => a.name), ["Architects"]);
  assert.equal(heavy.streams, 2);
  const mix = query(timeline, all).mix;
  assert.equal(mix[0].key, "core");
  assert.ok(Math.abs(mix.reduce((s, m) => s + m.share, 0) - 1) < 1e-9);
});

test("availableGenres lists only genres present in the history", () => {
  const { timeline } = build();
  assert.deepEqual(availableGenres(timeline).map(g => g.key), ["core", "edm"]);
});

test("albums are null when the export has no album data", () => {
  const agg = createAggregator();
  agg.addRecord({ endTime: "2024-01-31 18:05", artistName: "A", trackName: "T", msPlayed: 60000 });
  const stats = agg.finish();
  assert.equal(query(agg.timeline(), ranges(stats).find(r => r.key === "all")).albums, null);
});
