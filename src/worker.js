// Unzips and analyzes the export off the main thread, so the page stays responsive on large histories.
importScripts(
  "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
  "analyze.js"
);

const { analyze } = self.SpotifyPersona;

self.onmessage = async ({ data: file }) => {
  try {
    const zip = await JSZip.loadAsync(file);
    const entries = Object.values(zip.files)
      .filter(f => !f.dir && analyze.isHistoryFile(f.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (entries.length === 0) {
      throw new Error("No streaming history found in this zip. Look for files named Streaming_History_Audio_*.json or StreamingHistory*.json.");
    }

    const aggregator = analyze.createAggregator();
    for (let i = 0; i < entries.length; i++) {
      const records = JSON.parse(await entries[i].async("string"));
      for (const record of records) aggregator.addRecord(record);
      self.postMessage({ type: "progress", done: i + 1, total: entries.length });
    }

    const stats = aggregator.finish();
    if (!stats) throw new Error("The history files contain no music streams.");
    const timeline = aggregator.timeline();
    const buffers = ["trackArtist", "trackAlbum", "albumArtist", "slot", "track", "streams", "plays", "ms"].map(k => timeline[k].buffer);
    self.postMessage({ type: "done", stats, timeline }, buffers);
  } catch (err) {
    self.postMessage({ type: "error", message: err.message || String(err) });
  }
};
