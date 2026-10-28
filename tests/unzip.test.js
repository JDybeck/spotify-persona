const test = require("node:test");
const assert = require("node:assert/strict");
const { supported, listEntries, readText } = require("../src/unzip.js");

async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * A zip built byte by byte from [{ name, text, method }] (0 stored, 8 deflate). CRCs are left at
 * zero since the reader does not check them. `extra` pads each local header, like real zip tools do.
 */
async function makeZip(files, { extra = 0, comment = "" } = {}) {
  const enc = new TextEncoder();
  const parts = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const raw = enc.encode(f.text || "");
    const data = f.method === 8 ? await deflateRaw(raw) : raw;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, f.method || 0, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, extra, true);
    parts.push(new Uint8Array(local.buffer), name, new Uint8Array(extra), data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(10, f.method || 0, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, raw.length, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + extra + data.length;
  }
  const dirSize = central.reduce((s, p) => s + p.length, 0);
  const commentBytes = enc.encode(comment);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, commentBytes.length, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer), commentBytes]);
}

test("the runtime has native inflate", () => {
  assert.equal(supported(), true);
});

test("reads stored and deflated entries, skipping folders", async () => {
  const json = JSON.stringify([{ ts: "2024-01-01T10:00:00Z", master_metadata_track_name: "Låt" }]);
  const zip = await makeZip([
    { name: "Spotify Extended Streaming History/", text: "" },
    { name: "Spotify Extended Streaming History/Streaming_History_Audio_2024.json", text: json, method: 8 },
    { name: "ReadMeFirst.txt", text: "hello", method: 0 }
  ], { extra: 9, comment: "made by a test" });
  const entries = await listEntries(zip);
  assert.deepEqual(entries.map(e => e.name), ["Spotify Extended Streaming History/Streaming_History_Audio_2024.json", "ReadMeFirst.txt"]);
  assert.equal(await readText(zip, entries[0]), json);
  assert.equal(await readText(zip, entries[1]), "hello");
});

test("returns null for files that are not zips or use unsupported compression", async () => {
  assert.equal(await listEntries(new Blob(["not a zip at all, just some text"])), null);
  assert.equal(await listEntries(await makeZip([{ name: "a.json", text: "[]", method: 12 }])), null);
});
