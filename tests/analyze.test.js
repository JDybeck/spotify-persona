const test = require("node:test");
const assert = require("node:assert/strict");
const { createAggregator, normalize, isHistoryFile, MIN_ARTIST_STARTS_FOR_SKIPS } = require("../src/analyze.js");

function extended(overrides = {}) {
  return {
    ts: "2024-03-10T20:00:00Z",
    ms_played: 200000,
    master_metadata_track_name: "Song",
    master_metadata_album_artist_name: "Artist",
    episode_show_name: null,
    reason_end: "trackdone",
    shuffle: false,
    skipped: false,
    incognito_mode: false,
    ...overrides
  };
}

test("isHistoryFile matches both export formats and ignores the rest", () => {
  assert.ok(isHistoryFile("Spotify Extended Streaming History/Streaming_History_Audio_2020_1.json"));
  assert.ok(isHistoryFile("Spotify Account Data/StreamingHistory_music_0.json"));
  assert.ok(isHistoryFile("MyData/StreamingHistory0.json"));
  assert.ok(isHistoryFile("Spotify Account Data/StreamingHistory_podcast_0.json"));
  assert.ok(!isHistoryFile("Spotify Extended Streaming History/Streaming_History_Video_2020.json"));
  assert.ok(!isHistoryFile("Spotify Account Data/Playlist1.json"));
  assert.ok(!isHistoryFile("ReadMeFirst_ExtendedStreamingHistory.pdf"));
});

test("normalize reads extended records and treats a forward-button end as a skip", () => {
  const r = normalize(extended({ skipped: null, reason_end: "fwdbtn" }));
  assert.equal(r.kind, "music");
  assert.equal(r.artist, "Artist");
  assert.equal(r.skipped, true);
});

test("normalize reads basic account-data records without behavior fields", () => {
  const r = normalize({ endTime: "2024-01-31 18:05", artistName: "A", trackName: "T", msPlayed: 1000 });
  assert.equal(r.kind, "music");
  assert.equal(r.date.toISOString(), "2024-01-31T18:05:00.000Z");
  assert.equal(r.skipped, null);
});

test("normalize separates podcasts and drops unusable rows", () => {
  assert.equal(normalize(extended({ episode_show_name: "Show", master_metadata_track_name: null })).kind, "podcast");
  assert.equal(normalize({ endTime: "2024-01-01 10:00", podcastName: "Pod", episodeName: "Ep", msPlayed: 5 }).kind, "podcast");
  assert.equal(normalize(extended({ master_metadata_track_name: null })), null);
  assert.equal(normalize({ endTime: "2024-01-01 10:00", artistName: "Unknown Artist", trackName: "Unknown Track", msPlayed: 5 }), null);
  assert.equal(normalize({ something: "else" }), null);
});

test("finish returns null when nothing was added", () => {
  assert.equal(createAggregator().finish(), null);
});

test("aggregates hours, plays and top lists", () => {
  const agg = createAggregator();
  agg.addRecord(extended({ ms_played: 3600000 }));
  agg.addRecord(extended({ ms_played: 3600000, master_metadata_track_name: "Other" }));
  agg.addRecord(extended({ ms_played: 10000, master_metadata_album_artist_name: "Short" }));
  agg.addRecord(extended({ episode_show_name: "Pod", master_metadata_track_name: null, ms_played: 1800000 }));
  const s = agg.finish();
  assert.equal(s.records, 3);
  assert.equal(s.plays, 2, "streams under 30 seconds are not plays");
  assert.equal(s.totalHours, 2);
  assert.equal(s.podcastHours, 0.5);
  assert.equal(s.topArtists[0].name, "Artist");
  assert.equal(s.topArtists[0].hours, 2);
  assert.equal(s.distinctTracks, 3);
  assert.equal(s.shows[0].name, "Pod");
});

test("tracks skips per song and only ranks artists with enough starts", () => {
  const agg = createAggregator();
  for (let i = 0; i < MIN_ARTIST_STARTS_FOR_SKIPS; i++) {
    agg.addRecord(extended({ master_metadata_album_artist_name: "Skipped", skipped: i % 4 !== 0 }));
  }
  for (let i = 0; i < 5; i++) agg.addRecord(extended({ master_metadata_album_artist_name: "Rare", skipped: true }));
  const s = agg.finish();
  assert.equal(s.hasBehaviorData, true);
  assert.equal(s.skippedArtists.length, 1);
  assert.equal(s.skippedArtists[0].name, "Skipped");
  assert.equal(s.skippedArtists[0].rate, 0.75);
  assert.equal(s.skippedTracks[0].skips, 75);
});

test("basic-format history reports behavior stats as unknown", () => {
  const agg = createAggregator();
  agg.addRecord({ endTime: "2024-01-31 18:05", artistName: "A", trackName: "T", msPlayed: 60000 });
  const s = agg.finish();
  assert.equal(s.hasBehaviorData, false);
  assert.equal(s.skipRate, null);
  assert.equal(s.shuffleRate, null);
  assert.deepEqual(s.skippedTracks, []);
});

test("counts the most played track per day as an obsession", () => {
  const agg = createAggregator();
  for (let i = 0; i < 12; i++) agg.addRecord(extended({ ts: `2021-01-27T12:${String(i).padStart(2, "0")}:00Z` }));
  const s = agg.finish();
  assert.equal(s.obsessions[0].plays, 12);
  assert.equal(s.obsessions[0].track, "Song");
});

test("per-year breakdown counts streams, plays, skips and newly discovered artists", () => {
  const agg = createAggregator();
  agg.addRecord(extended({ ts: "2020-05-01T12:00:00Z", master_metadata_album_artist_name: "Old" }));
  agg.addRecord(extended({ ts: "2021-05-01T12:00:00Z", master_metadata_album_artist_name: "Old" }));
  agg.addRecord(extended({ ts: "2021-05-02T12:00:00Z", master_metadata_album_artist_name: "New", skipped: true }));
  agg.addRecord(extended({ ts: "2021-05-03T12:00:00Z", master_metadata_album_artist_name: "New", ms_played: 5000 }));
  const y2021 = agg.finish().years.find(y => y.year === 2021);
  assert.equal(y2021.streams, 3);
  assert.equal(y2021.plays, 2);
  assert.equal(y2021.skipRate, 1 / 3);
  assert.equal(y2021.distinctArtists, 2);
  assert.equal(y2021.newArtists, 1, "Old was discovered in 2020");
  assert.equal(y2021.topTracks.length, 2);
});

test("counts streams per country per year and ignores the unknown ZZ code", () => {
  const agg = createAggregator();
  agg.addRecord(extended({ conn_country: "SE" }));
  agg.addRecord(extended({ conn_country: "SE" }));
  agg.addRecord(extended({ conn_country: "AU" }));
  agg.addRecord(extended({ conn_country: "ZZ" }));
  assert.deepEqual(agg.finish().years[0].countries, [{ code: "SE", streams: 2 }, { code: "AU", streams: 1 }]);
});

test("first stream and per-year breakdown follow timestamps, not input order", () => {
  const agg = createAggregator();
  agg.addRecord(extended({ ts: "2022-06-01T12:00:00Z", master_metadata_track_name: "Later" }));
  agg.addRecord(extended({ ts: "2019-06-01T12:00:00Z", master_metadata_track_name: "Earliest" }));
  const s = agg.finish();
  assert.equal(s.firstTrack.track, "Earliest");
  assert.deepEqual(s.years.map(y => y.year), [2019, 2022]);
});
