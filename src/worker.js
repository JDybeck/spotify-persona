// Unzips and analyzes the export off the main thread, so the page stays responsive on large histories.
// After the first pass it keeps a compact copy of every stream, so a new year range only re-aggregates.
importScripts("analyze.js", "store.js", "habits.js", "unzip.js", "covers.js");

const { analyze, store: storeApi, habits: habitsApi, unzip, covers } = self.SpotifyPersona;
const JSZIP = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
const TIMELINE_BUFFERS = ["trackArtist", "trackAlbum", "albumArtist", "slot", "track", "streams", "plays", "ms"];
const PEEK_ALBUMS = 24;
const PEEK_EVERY_MS = 400;
let store = null;

function aggregate(range) {
  const aggregator = analyze.createAggregator();
  const habits = habitsApi.createHabitsBuilder();
  store.each(range, r => { aggregator.addNormalized(r); habits.add(r); });
  const stats = aggregator.finish();
  if (!stats) throw new Error("No music left in these years. Try a wider range or unhide an artist.");
  stats.habits = habits.finish();
  const timeline = aggregator.timeline();
  self.postMessage({ type: "done", stats, timeline, years: store.years(), range }, TIMELINE_BUFFERS.map(k => timeline[k].buffer));
}

/**
 * The history files in the zip as [{ name, text() }], sorted by name. Inflates natively when the
 * browser can, and only downloads JSZip for zips or browsers the native reader cannot handle.
 */
async function historyFiles(file) {
  const entries = unzip.supported() ? await unzip.listEntries(file) : null;
  let files;
  if (entries) {
    files = entries.map(e => ({ name: e.name, text: () => unzip.readText(file, e) }));
  } else {
    importScripts(JSZIP);
    const zip = await JSZip.loadAsync(file);
    files = Object.values(zip.files).filter(f => !f.dir).map(f => ({ name: f.name, text: () => f.async("string") }));
  }
  return files.filter(f => analyze.isHistoryFile(f.name)).sort((a, b) => a.name.localeCompare(b.name));
}

async function load(file, wantPeek) {
  const files = await historyFiles(file);
  if (files.length === 0) {
    throw new Error("No streaming history found in this zip. Look for files named Streaming_History_Audio_*.json or StreamingHistory*.json.");
  }
  store = storeApi.createRecordStore();
  const albums = covers.createAlbumTally();
  let lastPeek = -Infinity;
  // The next file inflates while the current one is parsed.
  let next = files[0].text();
  for (let i = 0; i < files.length; i++) {
    const text = await next;
    if (i + 1 < files.length) next = files[i + 1].text();
    for (const record of JSON.parse(text)) {
      const r = store.addRaw(record);
      if (r && wantPeek) albums.add(r);
    }
    self.postMessage({ type: "progress", done: i + 1, total: files.length });
    if (wantPeek && performance.now() - lastPeek >= PEEK_EVERY_MS) {
      lastPeek = performance.now();
      self.postMessage({ type: "peek", albums: albums.top(PEEK_ALBUMS) });
    }
  }
  if (store.years().length === 0) throw new Error("The history files contain no music streams.");
  self.postMessage({ type: "progress", done: files.length, total: files.length, phase: "analyze" });
  aggregate({ hiddenArtists });
}

// Artists the user chose to hide (baby music, a sibling's account...), applied to every aggregation.
let hiddenArtists = [];

self.onmessage = async ({ data }) => {
  try {
    if (data && data.type === "load") { hiddenArtists = data.hiddenArtists || []; await load(data.file, data.peek === true); }
    else if (data && data.type === "range" && store) {
      hiddenArtists = data.hiddenArtists || [];
      aggregate({ fromYear: data.fromYear, toYear: data.toYear, hiddenArtists });
    }
  } catch (err) {
    self.postMessage({ type: "error", message: err.message || String(err) });
  }
};
