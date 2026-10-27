const test = require("node:test");
const assert = require("node:assert/strict");
const { createAggregator } = require("../src/analyze.js");
const { pickAlbums, pickYearAlbums, dominantColor, coverUrl, loadCovers } = require("../src/covers.js");

// RGBA pixel data from [count, [r, g, b]] runs.
function pixels(...runs) {
  const out = [];
  for (const [count, rgb] of runs) for (let i = 0; i < count; i++) out.push(...rgb, 255);
  return Uint8ClampedArray.from(out);
}

const at = (y, m, d) => new Date(y, m - 1, d, 12, 0).toISOString();

function record(artist, track, album, id, ms = 200000) {
  return {
    ts: at(2020, 1, 1), ms_played: ms, master_metadata_track_name: track, master_metadata_album_artist_name: artist,
    master_metadata_album_album_name: album, spotify_track_uri: id ? `spotify:track:${id}` : null, reason_end: "trackdone"
  };
}

function timeline() {
  const agg = createAggregator();
  for (let i = 0; i < 3; i++) agg.addRecord(record("Architects", "Doomsday", "Holy Hell", "doom"));
  agg.addRecord(record("Architects", "Gravedigger", "Holy Hell", "grave"));
  for (let i = 0; i < 2; i++) agg.addRecord(record("Avicii", "Levels", "Levels", "levels"));
  agg.addRecord(record("Nobody", "Mystery", "No Id Album", null));
  return agg.timeline();
}

// A fake fetch that answers like Spotify's oEmbed endpoint and records what was asked.
function fakeFetch(known) {
  const calls = [];
  const fn = async url => {
    calls.push(url);
    const id = decodeURIComponent(url).split("/track/")[1];
    if (!known[id]) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ thumbnail_url: known[id] }) };
  };
  return { fn, calls };
}

test("pickAlbums ranks albums by time and uses each album's most-played track", () => {
  assert.deepEqual(pickAlbums(timeline()), [
    { album: "Holy Hell", artist: "Architects", trackId: "doom" },
    { album: "Levels", artist: "Avicii", trackId: "levels" }
  ], "albums without any Spotify track ID are skipped");
  assert.equal(pickAlbums(timeline(), 1).length, 1);
});

test("dominantColor lets a vivid accent beat a big black background", () => {
  assert.deepEqual(dominantColor(pixels([90, [5, 5, 5]], [10, [220, 30, 30]])), [220, 30, 30]);
});

test("dominantColor falls back to the average for black, white or grey covers", () => {
  assert.deepEqual(dominantColor(pixels([98, [10, 10, 10]], [2, [200, 40, 40]])), [14, 11, 11], "2% red is not enough to count");
  assert.deepEqual(dominantColor(pixels([50, [100, 100, 100]], [50, [200, 200, 200]])), [150, 150, 150]);
  assert.equal(dominantColor(new Uint8ClampedArray(0)), null);
});

test("pickYearAlbums takes each year's most listened album", () => {
  const agg = createAggregator();
  const add = (y, artist, track, album, id, n) => {
    for (let i = 0; i < n; i++) agg.addRecord({ ...record(artist, track, album, id), ts: new Date(y, 0, 1 + i, 12).toISOString() });
  };
  add(2019, "Avicii", "Levels", "Levels", "levels", 3);
  add(2019, "Architects", "Doomsday", "Holy Hell", "doom", 1);
  add(2020, "Architects", "Doomsday", "Holy Hell", "doom", 2);
  assert.deepEqual(pickYearAlbums(agg.timeline()).map(a => [a.year, a.album, a.trackId]), [[2019, "Levels", "levels"], [2020, "Holy Hell", "doom"]]);
});

test("coverUrl reads the thumbnail from oEmbed and rejects anything that is not https", async () => {
  const { fn, calls } = fakeFetch({ doom: "https://i.scdn.co/image/abc", bad: "javascript:alert(1)" });
  assert.equal(await coverUrl("doom", fn), "https://i.scdn.co/image/abc");
  assert.equal(calls[0], "https://open.spotify.com/oembed?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2Fdoom");
  assert.equal(await coverUrl("bad", fn), null);
  assert.equal(await coverUrl("missing", fn), null);
});

test("loadCovers uses the cache, skips failures and keeps the original order", async () => {
  const { fn, calls } = fakeFetch({ b: "https://img/b", c: "https://img/c" });
  const cache = new Map([["a", "https://img/a"]]);
  const seen = [];
  const items = [{ trackId: "a" }, { trackId: "b" }, { trackId: "x" }, { trackId: "c" }];
  const result = await loadCovers(items, { fetchFn: fn, cache, onCover: c => seen.push(c.trackId), concurrency: 2 });
  assert.deepEqual(result.map(r => r.url), ["https://img/a", "https://img/b", "https://img/c"]);
  assert.equal(calls.length, 3, "the cached cover is not fetched again");
  assert.equal(cache.get("c"), "https://img/c");
  assert.deepEqual([...seen].sort(), ["a", "b", "c"]);
});

test("loadCovers survives a network error", async () => {
  const fetchFn = async () => { throw new Error("offline"); };
  assert.deepEqual(await loadCovers([{ trackId: "a" }], { fetchFn, cache: new Map() }), []);
});
