const test = require("node:test");
const assert = require("node:assert/strict");
const { createAggregator } = require("../src/analyze.js");
const { available, idFor, albumTrackId, linksFor, topSongs } = require("../src/playlist.js");

function record(y, m, d, artist, track, id, album = "Album") {
  return {
    ts: new Date(y, m - 1, d, 12, 0).toISOString(), ms_played: 200000, master_metadata_track_name: track,
    master_metadata_album_artist_name: artist, master_metadata_album_album_name: album,
    spotify_track_uri: id ? `spotify:track:${id}` : null, reason_end: "trackdone"
  };
}

function timeline(records) {
  const agg = createAggregator();
  records.forEach(r => agg.addRecord(r));
  return agg.timeline();
}

const history = [
  record(2019, 12, 24, "Wham!", "Last Christmas", "xmas"),
  record(2020, 12, 24, "Wham!", "Last Christmas", "xmas"),
  record(2020, 7, 1, "Avicii", "Levels", "levels-single", "Levels"),
  record(2020, 7, 2, "Avicii", "Levels", "levels-album", "True"),
  record(2020, 7, 3, "Avicii", "Levels", "levels-album", "True"),
  record(2021, 7, 1, "Architects", "Doomsday", "doom"),
  record(2021, 7, 2, "Nobody", "No Link", null)
];

test("available is false for exports without track IDs", () => {
  assert.equal(available(timeline(history)), true);
  assert.equal(available(timeline([{ endTime: "2024-01-31 18:05", artistName: "A", trackName: "T", msPlayed: 60000 }])), false);
});

test("linksFor keeps order and drops unknown songs and duplicates; a song on several albums gets one link", () => {
  const t = timeline(history);
  const links = linksFor(t, [
    { track: "Doomsday", artist: "Architects" },
    { track: "Levels", artist: "Avicii" },
    { track: "No Link", artist: "Nobody" },
    { track: "Doomsday", artist: "Architects" }
  ]);
  assert.deepEqual(links, ["https://open.spotify.com/track/doom", "https://open.spotify.com/track/levels-single"]);
});

test("idFor and albumTrackId find the Spotify IDs used for covers", () => {
  const t = timeline(history);
  assert.equal(idFor(t, "Doomsday", "Architects"), "doom");
  assert.equal(idFor(t, "No Link", "Nobody"), null);
  assert.equal(idFor(t, "Missing", "Nobody"), null);
  assert.equal(albumTrackId(t, t.albumNames.indexOf("Levels")), "levels-single");
  assert.equal(albumTrackId(t, 999), null);
});

test("topSongs ranks by plays, counting a song on several albums once", () => {
  const top = topSongs(timeline(history));
  assert.deepEqual(top.slice(0, 2).map(s => [s.track, s.plays]), [["Levels", 3], ["Last Christmas", 2]]);
});

test("topSongs filters by years, months, genre and name", () => {
  const t = timeline(history);
  assert.deepEqual(topSongs(t, { years: [2021, 2021] }).map(s => s.track), ["Doomsday", "No Link"]);
  assert.deepEqual(topSongs(t, { months: [12] }).map(s => s.track), ["Last Christmas"]);
  assert.deepEqual(topSongs(t, { genre: "core" }).map(s => s.track), ["Doomsday"]);
  assert.deepEqual(topSongs(t, { match: /christmas/i }).map(s => [s.track, s.plays]), [["Last Christmas", 2]]);
  assert.equal(topSongs(t, {}, 1).length, 1);
});
