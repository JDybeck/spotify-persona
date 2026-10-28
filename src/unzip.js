// Minimal zip reader that inflates with the browser's native DecompressionStream, which is several
// times faster than a JavaScript inflater on a big export. Returns null for zips it does not handle
// (ZIP64, encryption, unusual compression), so the caller can fall back to JSZip.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.SpotifyPersona = root.SpotifyPersona || {}).unzip = api;
})(typeof self !== "undefined" ? self : this, function () {
  const EOCD = 0x06054b50, CENTRAL = 0x02014b50, LOCAL = 0x04034b50;
  const STORED = 0, DEFLATE = 8;
  const MAX_COMMENT = 0xffff;

  /** Whether this runtime can inflate natively. */
  function supported() {
    return typeof DecompressionStream === "function" && typeof Response === "function";
  }

  /**
   * The file entries of a zip as [{ name, method, size, offset }], read from its central directory.
   * Returns null when the zip uses something this reader does not support.
   */
  async function listEntries(blob) {
    // The end-of-central-directory record sits in the last 22 bytes plus an optional comment.
    const tailStart = Math.max(0, blob.size - 22 - MAX_COMMENT);
    const tail = new DataView(await blob.slice(tailStart).arrayBuffer());
    let eocd = -1;
    for (let p = tail.byteLength - 22; p >= 0; p--) {
      if (tail.getUint32(p, true) === EOCD) { eocd = p; break; }
    }
    if (eocd < 0) return null;
    const count = tail.getUint16(eocd + 10, true);
    const dirSize = tail.getUint32(eocd + 12, true);
    const dirOffset = tail.getUint32(eocd + 16, true);
    if (count === 0xffff || dirOffset === 0xffffffff) return null;

    const dir = new DataView(await blob.slice(dirOffset, dirOffset + dirSize).arrayBuffer());
    const decoder = new TextDecoder();
    const entries = [];
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > dir.byteLength || dir.getUint32(p, true) !== CENTRAL) return null;
      const flags = dir.getUint16(p + 8, true);
      const method = dir.getUint16(p + 10, true);
      const size = dir.getUint32(p + 20, true);
      const nameLength = dir.getUint16(p + 28, true);
      const extraLength = dir.getUint16(p + 30, true);
      const commentLength = dir.getUint16(p + 32, true);
      const offset = dir.getUint32(p + 42, true);
      const name = decoder.decode(new Uint8Array(dir.buffer, p + 46, nameLength));
      p += 46 + nameLength + extraLength + commentLength;
      if (name.endsWith("/")) continue;
      if (flags & 1 || size === 0xffffffff || offset === 0xffffffff) return null;
      if (method !== STORED && method !== DEFLATE) return null;
      entries.push({ name, method, size, offset });
    }
    return entries;
  }

  /** The decompressed contents of one entry from listEntries, decoded as UTF-8 text. */
  async function readText(blob, entry) {
    // The local header repeats the name and has its own extra field, so its length is read separately.
    const header = new DataView(await blob.slice(entry.offset, entry.offset + 30).arrayBuffer());
    if (header.getUint32(0, true) !== LOCAL) throw new Error(`Broken zip entry: ${entry.name}`);
    const start = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
    const data = blob.slice(start, start + entry.size);
    if (entry.method === STORED) return data.text();
    return new Response(data.stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  }

  return { supported, listEntries, readText };
});
