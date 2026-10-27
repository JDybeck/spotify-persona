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

  /** The cover image URL for a track, or null when Spotify has none. */
  async function coverUrl(trackId, fetchFn) {
    const res = await fetchFn(OEMBED + encodeURIComponent(`https://open.spotify.com/track/${trackId}`));
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body.thumbnail_url === "string" && body.thumbnail_url.startsWith("https://") ? body.thumbnail_url : null;
  }

  /**
   * Resolves covers a few at a time, reusing cached URLs. Calls onCover(item, url) as each one
   * arrives, so the page can show covers progressively. Failed lookups are skipped.
   */
  async function loadCovers(items, { fetchFn, cache, onCover = () => {}, concurrency = CONCURRENCY }) {
    const queue = [...items];
    const results = [];
    async function worker() {
      while (queue.length) {
        const item = queue.shift();
        let url = cache.get(item.trackId);
        if (!url) {
          try { url = await coverUrl(item.trackId, fetchFn); } catch { url = null; }
          if (url) cache.set(item.trackId, url);
        }
        if (url) {
          const withUrl = { ...item, url };
          results.push(withUrl);
          onCover(withUrl);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    // Keep the original order (biggest albums first), whatever order the lookups finished in.
    const rank = new Map(items.map((item, i) => [item.trackId, i]));
    return results.sort((a, b) => rank.get(a.trackId) - rank.get(b.trackId));
  }

  return { pickAlbums, coverUrl, loadCovers };
});
