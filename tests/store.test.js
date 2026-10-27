const test = require("node:test");
const assert = require("node:assert/strict");
const { createAggregator, normalize } = require("../src/analyze.js");
const { createRecordStore } = require("../src/store.js");

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h, 0).toISOString();

function extended(ts, overrides = {}) {
  return {
    ts, ms_played: 200000, master_metadata_track_name: "Song", master_metadata_album_artist_name: "Artist",
    master_metadata_album_album_name: "Album", spotify_track_uri: "spotify:track:abc", reason_start: "clickrow",
    reason_end: "trackdone", shuffle: false, skipped: false, incognito_mode: false, conn_country: "SE", platform: "android",
    ...overrides
  };
}

const records = [
  extended(at(2019, 5, 1)),
  extended(at(2020, 5, 1), { skipped: true, shuffle: true, master_metadata_track_name: "Other", conn_country: "AU" }),
  extended(at(2021, 5, 1), { master_metadata_album_artist_name: "Someone", platform: "windows", reason_start: "trackdone" }),
  extended(at(2021, 6, 1), { episode_show_name: "Pod", master_metadata_track_name: null }),
  { endTime: "2022-01-31 18:05", artistName: "Basic", trackName: "Plain", msPlayed: 60000 },
  { garbage: true }
];

test("the store gives back exactly what normalize produced", () => {
  const store = createRecordStore();
  const kept = records.filter(r => store.addRaw(r)).length;
  assert.equal(kept, 5, "the garbage record is dropped");
  const back = [];
  store.each({}, r => back.push(r));
  const expected = records.map(normalize).filter(Boolean);
  assert.equal(back.length, expected.length);
  back.forEach((r, i) => assert.deepEqual(r, expected[i]));
});

test("each filters by local calendar year and years lists only music years", () => {
  const store = createRecordStore();
  records.forEach(r => store.addRaw(r));
  const seen = [];
  store.each({ fromYear: 2020, toYear: 2021 }, r => seen.push(r.date.getFullYear()));
  assert.deepEqual(seen, [2020, 2021, 2021]);
  assert.deepEqual(store.years(), [2019, 2020, 2021, 2022]);
});

test("aggregating a year range from the store matches aggregating those records directly", () => {
  const store = createRecordStore();
  records.forEach(r => store.addRaw(r));
  const fromStore = createAggregator();
  store.each({ fromYear: 2020, toYear: 2021 }, r => fromStore.addNormalized(r));
  const direct = createAggregator();
  records.filter(r => r.ts && /^202[01]/.test(r.ts.slice(0, 4))).forEach(r => direct.addRecord(r));
  assert.deepEqual(fromStore.finish(), direct.finish());
});
