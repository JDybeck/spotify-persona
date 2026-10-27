const test = require("node:test");
const assert = require("node:assert/strict");
const { createAggregator } = require("../src/analyze.js");
const { pickAlbums, coverUrl, loadCovers } = require("../src/covers.js");

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
