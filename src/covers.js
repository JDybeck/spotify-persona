// Album covers for the user's top albums, looked up through Spotify's public oEmbed endpoint.
// Only used when the user opts in: it is the one feature that talks to a server (Spotify itself).
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.SpotifyPersona = root.SpotifyPersona || {}).covers = api;
})(typeof self !== "undefined" ? self : this, function () {
  const OEMBED = "https://open.spotify.com/oembed?url=";
  const DEFAULT_ALBUMS = 40;
  const CONCURRENCY = 4;

  /**
   * The most-listened albums that have a Spotify track ID, each with its most-played track,
   * since a cover is looked up through one of the album's tracks.
   */
  function pickAlbums(timeline, count = DEFAULT_ALBUMS) {
    const ids = timeline.trackSpotifyIds || [];
    const albumMs = new Map(), trackMs = new Map();
    for (let i = 0; i < timeline.slot.length; i++) {
      const t = timeline.track[i], album = timeline.trackAlbum[t];
      if (album < 0 || !ids[t]) continue;
      albumMs.set(album, (albumMs.get(album) || 0) + timeline.ms[i]);
      trackMs.set(t, (trackMs.get(t) || 0) + timeline.ms[i]);
    }
    const bestTrack = new Map();
    for (const [t, ms] of trackMs) {
      const album = timeline.trackAlbum[t];
      const best = bestTrack.get(album);
      if (best === undefined || ms > trackMs.get(best)) bestTrack.set(album, t);
    }
    return [...albumMs.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([album]) => ({
        album: timeline.albumNames[album],
        artist: timeline.artistNames[timeline.albumArtist[album]],
        trackId: ids[bestTrack.get(album)]
      }));
  }

  /**
   * Each year's most-listened albums (up to `perYear`) that have a Spotify track ID, biggest first,
   * as { year, albums: [{ album, artist, trackId }] }. The colour of a year is picked among them.
   */
  function pickYearAlbums(timeline, perYear = 3) {
    const ids = timeline.trackSpotifyIds || [];
    const byYear = new Map(), trackMs = new Map();
    for (let i = 0; i < timeline.slot.length; i++) {
      const t = timeline.track[i], album = timeline.trackAlbum[t];
      if (album < 0 || !ids[t]) continue;
      const year = new Date(Math.floor(timeline.slot[i] / 24) * 86400000).getUTCFullYear();
      if (!byYear.has(year)) byYear.set(year, new Map());
      const albums = byYear.get(year);
      albums.set(album, (albums.get(album) || 0) + timeline.ms[i]);
      trackMs.set(t, (trackMs.get(t) || 0) + timeline.ms[i]);
    }
    const bestTrack = new Map();
    for (const [t, ms] of trackMs) {
      const album = timeline.trackAlbum[t];
      const best = bestTrack.get(album);
      if (best === undefined || ms > trackMs.get(best)) bestTrack.set(album, t);
    }
    return [...byYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, albums]) => ({
      year,
      albums: [...albums.entries()].sort((a, b) => b[1] - a[1]).slice(0, perYear).map(([album]) => ({
        album: timeline.albumNames[album], artist: timeline.artistNames[timeline.albumArtist[album]], trackId: ids[bestTrack.get(album)]
      }))
    }));
  }

  /** How vivid a colour looks, 0 to 1: saturation times brightness, so grey, black and white score low. */
  function vividness([r, g, b]) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return max === 0 ? 0 : ((max - min) / max) * (max / 255);
  }

  /**
   * Picks a year's colour from its top albums' colours (biggest album first): the most vivid one,
   * unless none of them has real colour, in which case the biggest album's colour stands.
   */
  function yearColor(colors) {
    const usable = colors.filter(Boolean);
    if (usable.length === 0) return null;
    const best = usable.reduce((a, b) => (vividness(b) > vividness(a) ? b : a));
    return vividness(best) >= 0.2 ? best : usable[0];
  }

  const MIN_VIVID_SHARE = 0.05;

  /**
   * The dominant colour of an image from its RGBA pixels. When at least 5% of the cover is vivid
   * (saturated and not too dark), the strongest vivid colour wins, so a red logo beats a black
   * background. Otherwise the cover really is black, white or grey, and its average is returned.
   * Returns [r, g, b], or null for an empty image.
   */
  function dominantColor(data) {
    const buckets = new Map();
    let pixels = 0, vivid = 0;
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      pixels++;
      sum[0] += r; sum[1] += g; sum[2] += b;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      if (saturation < 0.25 || max < 50) continue;
      vivid++;
      const weight = saturation * (max / 255);
      const key = (r >> 5) << 6 | (g >> 5) << 3 | (b >> 5);
      const bucket = buckets.get(key) || { w: 0, r: 0, g: 0, b: 0 };
      bucket.w += weight; bucket.r += r * weight; bucket.g += g * weight; bucket.b += b * weight;
      buckets.set(key, bucket);
    }
    if (pixels === 0) return null;
    if (vivid / pixels < MIN_VIVID_SHARE) return sum.map(v => Math.round(v / pixels));
    const best = [...buckets.values()].reduce((a, b) => (b.w > a.w ? b : a));
    return [best.r / best.w, best.g / best.w, best.b / best.w].map(Math.round);
  }

  /** The cover image URL for a track, or null when Spotify has none. */
  async function coverUrl(trackId, fetchFn) {
    const res = await fetchFn(OEMBED + encodeURIComponent(`https://open.spotify.com/track/${trackId}`));
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body.thumbnail_url === "string" && body.thumbnail_url.startsWith("https://") ? body.thumbnail_url : null;
  }

  /**
   * One shared lookup queue for every cover on the page: cached URLs come back at once, the same track
   * is only fetched once however many rows ask for it, and at most `concurrency` requests run together.
   * cache is { get, set, save? }; save runs whenever the queue goes idle.
   */
  function createCoverQueue({ fetchFn, cache, concurrency = CONCURRENCY }) {
    const pending = new Map();
    const waiting = [];
    let running = 0;

    function pump() {
      while (running < concurrency && waiting.length) {
        const { trackId, resolve } = waiting.shift();
        running++;
        coverUrl(trackId, fetchFn)
          .catch(() => null)
          .then(url => {
            if (url) cache.set(trackId, url);
            pending.delete(trackId);
            resolve(url);
            running--;
            if (running === 0 && waiting.length === 0 && cache.save) cache.save();
            pump();
          });
      }
    }

    /** The cover URL for a Spotify track ID, or null when there is none. */
    function get(trackId) {
      if (!trackId) return Promise.resolve(null);
      const cached = cache.get(trackId);
      if (cached) return Promise.resolve(cached);
      if (!pending.has(trackId)) {
        pending.set(trackId, new Promise(resolve => waiting.push({ trackId, resolve })));
        pump();
      }
      return pending.get(trackId);
    }

    return { get };
  }

  /**
   * Resolves covers for a list of { trackId } items through a cover queue, calling onCover as each
   * arrives. Failed lookups are skipped; the result keeps the original order (biggest albums first).
   */
  async function loadCovers(items, { fetchFn, cache, onCover = () => {}, concurrency = CONCURRENCY, queue = null }) {
    const q = queue || createCoverQueue({ fetchFn, cache, concurrency });
    const results = await Promise.all(items.map(async item => {
      const url = await q.get(item.trackId);
      if (!url) return null;
      const withUrl = { ...item, url };
      onCover(withUrl);
      return withUrl;
    }));
    return results.filter(Boolean);
  }

  return { pickAlbums, pickYearAlbums, dominantColor, vividness, yearColor, coverUrl, createCoverQueue, loadCovers };
});
