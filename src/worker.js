// Unzips and analyzes the export off the main thread, so the page stays responsive on large histories.
// After the first pass it keeps a compact copy of every stream, so a new year range only re-aggregates.
importScripts(
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "analyze.js",
  "store.js"
);

const { analyze, store: storeApi } = self.SpotifyPersona;
const TIMELINE_BUFFERS = ["trackArtist", "trackAlbum", "albumArtist", "slot", "track", "streams", "plays", "ms"];
let store = null;

function aggregate(range) {
  const aggregator = analyze.createAggregator();
  store.each(range, r => aggregator.addNormalized(r));
  const stats = aggregator.finish();
  if (!stats) throw new Error("No music was played in these years.");
  const timeline = aggregator.timeline();
  self.postMessage({ type: "done", stats, timeline, years: store.years(), range }, TIMELINE_BUFFERS.map(k => timeline[k].buffer));
}

async function load(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files)
    .filter(f => !f.dir && analyze.isHistoryFile(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length === 0) {
    throw new Error("No streaming history found in this zip. Look for files named Streaming_History_Audio_*.json or StreamingHistory*.json.");
  }
  store = storeApi.createRecordStore();
  for (let i = 0; i < entries.length; i++) {
    const records = JSON.parse(await entries[i].async("string"));
    for (const record of records) store.addRaw(record);
    self.postMessage({ type: "progress", done: i + 1, total: entries.length });
  }
  if (store.years().length === 0) throw new Error("The history files contain no music streams.");
  aggregate({});
}

self.onmessage = async ({ data }) => {
  try {
    if (data instanceof Blob) await load(data);
    else if (data && data.type === "range" && store) aggregate({ fromYear: data.fromYear, toYear: data.toYear });
  } catch (err) {
    self.postMessage({ type: "error", message: err.message || String(err) });
  }
};
