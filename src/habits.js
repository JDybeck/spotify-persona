// Listening habits that need every stream in time order: sessions, streaks, New Year's songs,
// who picks the music, devices, comebacks, seasons and Christmas music.
// Pure logic with no DOM access, fed one normalized stream at a time like the main aggregator.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.SpotifyPersona = root.SpotifyPersona || {}).habits = api;
})(typeof self !== "undefined" ? self : this, function () {
  const MINUTE = 60000, HOUR = 3600000, DAY = 86400000;
  const SESSION_GAP = 10 * MINUTE;
  const LONG_SESSION = 3 * HOUR;
  const MIN_PLAY_MS = 30000;
  const COMEBACK_SILENT_YEARS = 3, COMEBACK_BEFORE = 10, COMEBACK_AFTER = 5;
  const SEASONAL_MIN_PLAYS = 40, SEASONAL_MIN_SHARE = 0.6;
  const CHRISTMAS = /christmas|xmas|x-mas|jingle bell|santa claus|navidad|weihnacht|\bjul(en|afton|sång|en är här)?\b|tomten|stilla natt|silent night|last christmas|let it snow/i;

  const SEASONS = ["winter", "spring", "summer", "autumn"];
  const seasonOf = month => [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 0][month];

  // reason_start values grouped by who decided what played next.
  const REASONS = {
    chose: { label: "You picked it", values: ["clickrow", "playbtn", "clickside", "uriopen", "popup", "remote", "backbtn"] },
    flowed: { label: "It just kept playing", values: ["trackdone", "appload", "endplay"] },
    skipped: { label: "You skipped to it", values: ["fwdbtn"] }
  };
  const reasonGroup = new Map();
  for (const [key, r] of Object.entries(REASONS)) for (const v of r.values) reasonGroup.set(v, key);

  const DEVICES = [
    ["android", /android/i, "Android phone"],
    ["iphone", /\bios\b|iphone|ipad/i, "iPhone or iPad"],
    ["windows", /windows/i, "Windows PC"],
    ["mac", /os x|osx|macos|\bmac\b/i, "Mac"],
    ["linux", /linux/i, "Linux"],
    ["web", /web|browser|chrome|firefox/i, "Web player"],
    ["living", /cast|sonos|speaker|\btv\b|playstation|xbox|ps[345]|partner|roku|echo|alexa|car|tesla/i, "Speakers, TV and consoles"]
  ];
  const DEVICE_LABELS = Object.fromEntries([...DEVICES.map(([k, , label]) => [k, label]), ["other", "Unknown device"]]);

  function deviceCategory(platform) {
    if (!platform || platform === "not_applicable") return "other";
    const hit = DEVICES.find(([, re]) => re.test(platform));
    return hit ? hit[0] : "other";
  }

  // Apple model identifiers ("iPhone7,2") to the names people know. Unknown ones are shown as-is.
  const APPLE_MODELS = {
    "iPhone1,1": "iPhone", "iPhone1,2": "iPhone 3G", "iPhone2,1": "iPhone 3GS", "iPhone3,1": "iPhone 4", "iPhone3,3": "iPhone 4",
    "iPhone4,1": "iPhone 4S", "iPhone5,1": "iPhone 5", "iPhone5,2": "iPhone 5", "iPhone5,3": "iPhone 5c", "iPhone5,4": "iPhone 5c",
    "iPhone6,1": "iPhone 5s", "iPhone6,2": "iPhone 5s", "iPhone7,1": "iPhone 6 Plus", "iPhone7,2": "iPhone 6", "iPhone8,1": "iPhone 6s",
    "iPhone8,2": "iPhone 6s Plus", "iPhone8,4": "iPhone SE", "iPhone9,1": "iPhone 7", "iPhone9,3": "iPhone 7", "iPhone9,2": "iPhone 7 Plus",
    "iPhone9,4": "iPhone 7 Plus", "iPhone10,1": "iPhone 8", "iPhone10,4": "iPhone 8", "iPhone10,2": "iPhone 8 Plus", "iPhone10,5": "iPhone 8 Plus",
    "iPhone10,3": "iPhone X", "iPhone10,6": "iPhone X", "iPhone11,2": "iPhone XS", "iPhone11,4": "iPhone XS Max", "iPhone11,6": "iPhone XS Max",
    "iPhone11,8": "iPhone XR", "iPhone12,1": "iPhone 11", "iPhone12,3": "iPhone 11 Pro", "iPhone12,5": "iPhone 11 Pro Max",
    "iPhone12,8": "iPhone SE (2nd gen)", "iPhone13,1": "iPhone 12 mini", "iPhone13,2": "iPhone 12", "iPhone13,3": "iPhone 12 Pro",
    "iPhone13,4": "iPhone 12 Pro Max", "iPhone14,4": "iPhone 13 mini", "iPhone14,5": "iPhone 13", "iPhone14,2": "iPhone 13 Pro",
    "iPhone14,3": "iPhone 13 Pro Max", "iPhone14,6": "iPhone SE (3rd gen)", "iPhone14,7": "iPhone 14", "iPhone14,8": "iPhone 14 Plus",
    "iPhone15,2": "iPhone 14 Pro", "iPhone15,3": "iPhone 14 Pro Max", "iPhone15,4": "iPhone 15", "iPhone15,5": "iPhone 15 Plus",
    "iPhone16,1": "iPhone 15 Pro", "iPhone16,2": "iPhone 15 Pro Max", "iPhone17,3": "iPhone 16", "iPhone17,4": "iPhone 16 Plus",
    "iPhone17,1": "iPhone 16 Pro", "iPhone17,2": "iPhone 16 Pro Max",
    "iPod3,1": "iPod touch (3rd gen)", "iPod4,1": "iPod touch (4th gen)", "iPod5,1": "iPod touch (5th gen)", "iPod7,1": "iPod touch (6th gen)", "iPod9,1": "iPod touch (7th gen)"
  };
  const PARTNERS = [
    [/ps5/i, "PlayStation 5"], [/ps4/i, "PlayStation 4"], [/ps3/i, "PlayStation 3"], [/xbox/i, "Xbox"], [/sonos/i, "Sonos"],
    [/cast|chromecast/i, "Chromecast"], [/echo|alexa|amazon/i, "Amazon Echo"], [/tesla/i, "Tesla"], [/tv/i, "Smart TV"]
  ];
  const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

  /**
   * A readable device name: "Samsung SM-G955F" from "Android OS 9 API 28 (samsung, SM-G955F)",
   * "iPhone 6" from "iOS 10.3 (iPhone7,2)", "Windows 10" from "Windows 10 (10.0...)", "PlayStation 4" from partner strings.
   */
  function deviceName(platform) {
    if (!platform || platform === "not_applicable") return null;
    if (/partner/i.test(platform)) {
      const partner = PARTNERS.find(([re]) => re.test(platform));
      return partner ? partner[1] : "Partner device";
    }
    // Identifiers come as "iPhone7,2" or "ipod4,1"; normalise the family's casing before the lookup.
    const apple = platform.match(/\b(iphone|ipod|ipad)(\d+),\s*(\d+)\b/i);
    if (apple) {
      const family = { iphone: "iPhone", ipod: "iPod", ipad: "iPad" }[apple[1].toLowerCase()];
      const id = `${family}${apple[2]},${apple[3]}`;
      return APPLE_MODELS[id] || id;
    }
    const inner = platform.match(/\(([^,()]+),\s*([^)]+)\)/);
    if (inner && !/^\d/.test(inner[1].trim())) return `${capitalize(inner[1].trim())} ${inner[2].trim()}`;
    const head = platform.split("(")[0].trim();
    return head.length > 1 ? head.replace(/\s+\[.*\]$/, "") : null;
  }

  const pad = n => String(n).padStart(2, "0");
  const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localDay = d => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
  const isoOfDayNumber = n => new Date(n * DAY).toISOString().slice(0, 10);
  const inc = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by);

  function createHabitsBuilder() {
    const keyIds = new Map(), names = [];
    const start = [], end = [], key = [];
    const days = new Set();
    const firstOfYear = new Map();
    const reasonsByYear = new Map(), shuffleByYear = new Map();
    const deviceMsByYear = new Map(), deviceNames = new Map();
    const trackYears = new Map();
    const artistSeasons = new Map();
    const christmasByYear = new Map(), christmasSongs = new Map();
    // A history has only a handful of platform strings and repeats every song, so the regex work is done once each.
    const platformInfo = new Map(), isChristmas = new Map();
    let behavior = false;

    function deviceOf(platform) {
      let info = platformInfo.get(platform);
      if (!info) platformInfo.set(platform, info = { category: deviceCategory(platform), name: deviceName(platform) });
      return info;
    }

    function idOf(track, artist) {
      const k = `${track}\u0000${artist}`;
      let id = keyIds.get(k);
      if (id === undefined) { id = names.length; keyIds.set(k, id); names.push({ track, artist }); }
      return id;
    }

    function add(r) {
      if (r.kind !== "music") return;
      const d = r.date, t = d.getTime(), year = d.getFullYear(), id = idOf(r.track, r.artist);
      start.push(t - r.ms);
      end.push(t);
      key.push(id);
      days.add(localDay(d));

      // Spotify timestamps mark when a stream ended, so the year's first song is the earliest start.
      const began = t - r.ms;
      const first = firstOfYear.get(year);
      if (!first || began < first.t) firstOfYear.set(year, { t: began, id, date: new Date(began) });

      if (r.skipped !== null) {
        behavior = true;
        const group = reasonGroup.get(r.reasonStart);
        if (group) {
          if (!reasonsByYear.has(year)) reasonsByYear.set(year, new Map());
          inc(reasonsByYear.get(year), group);
        }
        const sh = shuffleByYear.get(year) || { on: 0, all: 0 };
        sh.all++;
        if (r.shuffle) sh.on++;
        shuffleByYear.set(year, sh);
      }

      if (r.platform) {
        if (!deviceMsByYear.has(year)) deviceMsByYear.set(year, new Map());
        const { category, name } = deviceOf(r.platform);
        inc(deviceMsByYear.get(year), category, r.ms);
        if (name) {
          const dn = deviceNames.get(name) || { ms: 0, first: year, last: year, category };
          dn.ms += r.ms;
          dn.first = Math.min(dn.first, year);
          dn.last = Math.max(dn.last, year);
          deviceNames.set(name, dn);
        }
      }

      if (r.ms < MIN_PLAY_MS) return;
      if (!trackYears.has(id)) trackYears.set(id, new Map());
      inc(trackYears.get(id), year);
      const seasons = artistSeasons.get(r.artist) || [0, 0, 0, 0];
      seasons[seasonOf(d.getMonth())]++;
      artistSeasons.set(r.artist, seasons);
      if (!isChristmas.has(id)) isChristmas.set(id, CHRISTMAS.test(r.track));
      if (isChristmas.get(id)) {
        const c = christmasByYear.get(year) || { plays: 0, first: null, outOfSeason: 0 };
        c.plays++;
        const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
        // The season starts in autumn; anything before September counts as out of season.
        if (d.getMonth() >= 8 && (!c.first || md < c.first)) c.first = md;
        if (d.getMonth() < 8) c.outOfSeason++;
        christmasByYear.set(year, c);
        inc(christmasSongs, id);
      }
    }

    function sessions() {
      if (start.length === 0) return null;
      const order = Array.from(start.keys()).sort((a, b) => start[a] - start[b]);
      let best = null, long = 0;
      const lengths = [];
      let s = 0, playedMs = 0, sessionEnd = end[order[0]];
      const close = e => {
        lengths.push(playedMs);
        if (playedMs >= LONG_SESSION) long++;
        if (!best || playedMs > best.ms) best = { from: s, to: e, ms: playedMs };
      };
      for (let i = 0; i < order.length; i++) {
        const k = order[i];
        if (i > 0 && start[k] - sessionEnd > SESSION_GAP) {
          close(i - 1);
          s = i;
          playedMs = 0;
        }
        playedMs += end[k] - start[k];
        sessionEnd = Math.max(sessionEnd, end[k]);
      }
      close(order.length - 1);

      const counts = new Map();
      for (let i = best.from; i <= best.to; i++) inc(counts, key[order[i]]);
      const startDate = new Date(start[order[best.from]]);
      lengths.sort((a, b) => a - b);
      return {
        longest: {
          date: isoDay(startDate),
          startTime: `${pad(startDate.getHours())}:${pad(startDate.getMinutes())}`,
          hours: best.ms / HOUR,
          streams: best.to - best.from + 1,
          topTracks: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => ({ ...names[id], plays: n }))
        },
        longSessions: long,
        count: lengths.length,
        medianMinutes: lengths[Math.floor(lengths.length / 2)] / MINUTE
      };
    }

    function streaks() {
      const sorted = [...days].sort((a, b) => a - b);
      if (sorted.length === 0) return null;
      let best = { from: sorted[0], to: sorted[0] }, runStart = sorted[0];
      for (let i = 1; i <= sorted.length; i++) {
        if (i < sorted.length && sorted[i] === sorted[i - 1] + 1) continue;
        const run = { from: runStart, to: sorted[i - 1] };
        if (run.to - run.from > best.to - best.from) best = run;
        if (i < sorted.length) runStart = sorted[i];
      }
      const last = sorted[sorted.length - 1];
      let currentFrom = last;
      for (let i = sorted.length - 2; i >= 0 && sorted[i] === currentFrom - 1; i--) currentFrom = sorted[i];
      const describe = run => ({ days: run.to - run.from + 1, from: isoOfDayNumber(run.from), to: isoOfDayNumber(run.to) });
      return { longest: describe(best), latest: describe({ from: currentFrom, to: last }), activeDays: sorted.length };
    }

    function algorithm() {
      if (!behavior || reasonsByYear.size === 0) return null;
      const total = new Map();
      const byYear = [...reasonsByYear.keys()].sort((a, b) => a - b).map(year => {
        const counts = reasonsByYear.get(year);
        const sum = [...counts.values()].reduce((s, n) => s + n, 0);
        for (const [k, n] of counts) inc(total, k, n);
        const sh = shuffleByYear.get(year);
        return {
          year,
          ...Object.fromEntries(Object.keys(REASONS).map(k => [k, (counts.get(k) || 0) / sum])),
          shuffle: sh && sh.all ? sh.on / sh.all : null
        };
      });
      const sum = [...total.values()].reduce((s, n) => s + n, 0);
      return { shares: Object.keys(REASONS).map(k => ({ key: k, label: REASONS[k].label, share: (total.get(k) || 0) / sum })), byYear };
    }

    function devices() {
      if (deviceMsByYear.size === 0) return null;
      const total = new Map();
      const byYear = [...deviceMsByYear.keys()].sort((a, b) => a - b).map(year => {
        const m = deviceMsByYear.get(year);
        const sum = [...m.values()].reduce((s, n) => s + n, 0);
        for (const [k, v] of m) inc(total, k, v);
        return { year, shares: [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: DEVICE_LABELS[k], share: v / sum })) };
      });
      const sum = [...total.values()].reduce((s, n) => s + n, 0);
      const history = [...deviceNames.entries()]
        .filter(([, d]) => d.ms >= 5 * HOUR)
        .sort((a, b) => a[1].first - b[1].first || b[1].ms - a[1].ms)
        .map(([name, d]) => ({ name, category: d.category, hours: d.ms / HOUR, first: d.first, last: d.last }));
      return {
        shares: [...total.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: DEVICE_LABELS[k], share: v / sum })),
        byYear,
        history
      };
    }

    function comebacks() {
      const found = [];
      for (const [id, yearsMap] of trackYears) {
        const years = [...yearsMap.keys()].sort((a, b) => a - b);
        if (years.length < 2) continue;
        let before = 0, best = null;
        const total = [...yearsMap.values()].reduce((s, n) => s + n, 0);
        for (let i = 0; i < years.length - 1; i++) {
          before += yearsMap.get(years[i]);
          const silent = years[i + 1] - years[i] - 1;
          const after = total - before;
          if (silent >= COMEBACK_SILENT_YEARS && before >= COMEBACK_BEFORE && after >= COMEBACK_AFTER && (!best || silent > best.silentYears)) {
            best = { lastYear: years[i], backYear: years[i + 1], silentYears: silent, playsBefore: before, playsAfter: after };
          }
        }
        if (best) found.push({ ...names[id], ...best });
      }
      return found.sort((a, b) => b.playsAfter - a.playsAfter).slice(0, 8);
    }

    function seasons() {
      const top = {};
      SEASONS.forEach((season, i) => {
        top[season] = [...artistSeasons.entries()].filter(([, s]) => s[i] > 0).sort((a, b) => b[1][i] - a[1][i]).slice(0, 5).map(([name, s]) => ({ name, plays: s[i] }));
      });
      const seasonal = [...artistSeasons.entries()]
        .map(([name, s]) => {
          const plays = s.reduce((a, b) => a + b, 0);
          const i = s.indexOf(Math.max(...s));
          return { name, plays, season: SEASONS[i], share: s[i] / plays };
        })
        .filter(a => a.plays >= SEASONAL_MIN_PLAYS && a.share >= SEASONAL_MIN_SHARE)
        .sort((a, b) => b.share * b.plays - a.share * a.plays)
        .slice(0, 6);
      return { top, seasonal };
    }

    function christmas() {
      const total = [...christmasByYear.values()].reduce((s, c) => s + c.plays, 0);
      if (total === 0) return null;
      return {
        total,
        byYear: [...christmasByYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, c]) => ({ year, ...c })),
        topSongs: [...christmasSongs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ ...names[id], plays: n }))
      };
    }

    function finish() {
      if (start.length === 0) return null;
      return {
        sessions: sessions(),
        streaks: streaks(),
        newYear: [...firstOfYear.entries()].sort((a, b) => a[0] - b[0]).map(([year, f]) => ({
          year, ...names[f.id], date: isoDay(f.date), time: `${pad(f.date.getHours())}:${pad(f.date.getMinutes())}`
        })),
        algorithm: algorithm(),
        devices: devices(),
        comebacks: comebacks(),
        seasons: seasons(),
        christmas: christmas()
      };
    }

    return { add, finish };
  }

  return { createHabitsBuilder, deviceCategory, deviceName, CHRISTMAS, REASONS };
});
