const test = require("node:test");
const assert = require("node:assert/strict");
const { createHabitsBuilder, deviceCategory, deviceName, CHRISTMAS } = require("../src/habits.js");

const MIN = 60000;

// Normalized music streams, like the record store hands out. `at` is local time; ms defaults to 3 minutes.
function stream(at, overrides = {}) {
  const [y, m, d, h = 12, min = 0] = at;
  return {
    kind: "music", date: new Date(y, m - 1, d, h, min), ms: 3 * MIN, artist: "Artist", track: "Song",
    skipped: false, shuffle: false, incognito: false, country: "SE", platform: "android", reasonStart: "clickrow",
    ...overrides
  };
}

function build(streams) {
  const b = createHabitsBuilder();
  streams.forEach(s => b.add(s));
  return b.finish();
}

test("sessions split on 10 minutes of silence and find the longest", () => {
  const streams = [];
  // 20 back-to-back songs from 20:00, then a gap, then 2 songs.
  for (let i = 0; i < 20; i++) streams.push(stream([2020, 1, 1, 20, 3 + i * 3], { track: i % 2 ? "B" : "A" }));
  streams.push(stream([2020, 1, 2, 9, 0]), stream([2020, 1, 2, 9, 3]));
  const s = build(streams).sessions;
  assert.equal(s.count, 2);
  assert.equal(s.longest.streams, 20);
  assert.equal(s.longest.hours, 1);
  assert.equal(s.longest.startTime, "20:00");
  assert.deepEqual(s.longest.topTracks.map(t => [t.track, t.plays]), [["A", 10], ["B", 10]]);
});

test("streaks find the longest run and the run at the end", () => {
  const days = [[2020, 1, 1], [2020, 1, 2], [2020, 1, 3], [2020, 1, 10], [2020, 1, 11]];
  const st = build(days.map(d => stream(d))).streaks;
  assert.deepEqual(st.longest, { days: 3, from: "2020-01-01", to: "2020-01-03" });
  assert.deepEqual(st.latest, { days: 2, from: "2020-01-10", to: "2020-01-11" });
  assert.equal(st.activeDays, 5);
});

test("the New Year's song is the first stream of each year", () => {
  const h = build([
    stream([2021, 1, 1, 0, 30], { track: "Later" }),
    stream([2021, 1, 1, 0, 4], { track: "First" }),
    stream([2022, 3, 5], { track: "Late start" })
  ]);
  assert.deepEqual(h.newYear.map(n => [n.year, n.track, n.time]), [[2021, "First", "00:01"], [2022, "Late start", "11:57"]]);
});

test("who picks the music groups reason_start and tracks shuffle per year", () => {
  const h = build([
    stream([2020, 1, 1], { reasonStart: "clickrow", shuffle: true }),
    stream([2020, 1, 1], { reasonStart: "trackdone" }),
    stream([2020, 1, 1], { reasonStart: "trackdone" }),
    stream([2020, 1, 1], { reasonStart: "fwdbtn" })
  ]);
  const shares = Object.fromEntries(h.algorithm.shares.map(s => [s.key, s.share]));
  assert.deepEqual(shares, { chose: 0.25, flowed: 0.5, skipped: 0.25 });
  assert.equal(h.algorithm.byYear[0].shuffle, 0.25);
  assert.equal(build([stream([2020, 1, 1], { skipped: null, reasonStart: null })]).algorithm, null, "basic exports have no such data");
});

test("devices get categories and readable names", () => {
  assert.equal(deviceCategory("Android OS 9 API 28 (samsung, SM-G955F)"), "android");
  assert.equal(deviceCategory("Windows 10 (10.0.17763; x64)"), "windows");
  assert.equal(deviceCategory("iOS 10.3.3 (iPhone7,2)"), "iphone");
  assert.equal(deviceCategory("not_applicable"), "other");
  assert.equal(deviceName("Android OS 9 API 28 (samsung, SM-G955F)"), "Samsung SM-G955F");
  assert.equal(deviceName("iOS 10.3.3 (iPhone7,2)"), "iPhone 6");
  assert.equal(deviceName("iPhone OS 4.1 (ipod4,1)"), "iPod touch (4th gen)");
  assert.equal(deviceName("iOS 18.0 (iPhone99,9)"), "iPhone99,9", "unknown models keep their identifier");
  assert.equal(deviceName("Windows 7 (6.1.7601; x64; SP1; S)"), "Windows 7");
  assert.equal(deviceName("Partner SCEI sony_tv;ps4;;"), "PlayStation 4");
  assert.equal(deviceName("not_applicable"), null);
});

test("device history spans first to last year for devices with real use", () => {
  const streams = [];
  for (let i = 0; i < 60; i++) streams.push(stream([2017, 1, 1 + (i % 28)], { platform: "iOS 10 (iPhone7,2)", ms: 6 * MIN }));
  for (let i = 0; i < 60; i++) streams.push(stream([2019, 1, 1 + (i % 28)], { platform: "iOS 12 (iPhone7,2)", ms: 6 * MIN }));
  streams.push(stream([2018, 1, 1], { platform: "Windows 10 (10.0)" }));
  const d = build(streams).devices;
  assert.deepEqual(d.history.map(x => [x.name, x.first, x.last]), [["iPhone 6", 2017, 2019]], "a device under 5 hours is left out");
  assert.equal(d.shares[0].key, "iphone");
});

test("comebacks need three silent years with plays on both sides", () => {
  const streams = [];
  for (let i = 0; i < 12; i++) streams.push(stream([2012, 1, 1 + i], { track: "Old Love" }));
  for (let i = 0; i < 6; i++) streams.push(stream([2017, 1, 1 + i], { track: "Old Love" }));
  for (let i = 0; i < 12; i++) streams.push(stream([2012, 1, 1 + i], { track: "Short Gap" }));
  for (let i = 0; i < 6; i++) streams.push(stream([2014, 1, 1 + i], { track: "Short Gap" }));
  const c = build(streams).comebacks;
  assert.deepEqual(c.map(x => [x.track, x.lastYear, x.backYear, x.silentYears, x.playsBefore, x.playsAfter]), [["Old Love", 2012, 2017, 4, 12, 6]]);
});

test("seasons rank artists per season and find seasonal ones", () => {
  const streams = [];
  for (let i = 0; i < 45; i++) streams.push(stream([2020, 12, 1 + (i % 28)], { artist: "Winter Band" }));
  for (let i = 0; i < 5; i++) streams.push(stream([2020, 7, 1 + i], { artist: "Winter Band" }));
  for (let i = 0; i < 10; i++) streams.push(stream([2020, 7, 1 + i], { artist: "Summer Band" }));
  const s = build(streams).seasons;
  assert.equal(s.top.winter[0].name, "Winter Band");
  assert.equal(s.top.summer[0].name, "Summer Band");
  assert.deepEqual(s.seasonal.map(a => [a.name, a.season, a.share]), [["Winter Band", "winter", 0.9]]);
});

test("Christmas songs are counted per year with the start of the season", () => {
  assert.ok(CHRISTMAS.test("Last Christmas"));
  assert.ok(CHRISTMAS.test("Tänd ett ljus - Jul"));
  assert.ok(!CHRISTMAS.test("July"), "July is not Christmas");
  const h = build([
    stream([2020, 11, 20], { track: "All I Want for Christmas Is You" }),
    stream([2020, 12, 24], { track: "Last Christmas" }),
    stream([2020, 7, 1], { track: "Last Christmas" }),
    stream([2020, 12, 1], { track: "Normal Song" })
  ]);
  assert.equal(h.christmas.total, 3);
  assert.deepEqual(h.christmas.byYear, [{ year: 2020, plays: 3, first: "11-20", outOfSeason: 1 }]);
  assert.equal(h.christmas.topSongs[0].track, "Last Christmas");
});
