// Wires the upload screen to the worker, keeps the user's profile (birth date, chapters) and re-renders on changes.
(function () {
  const $ = id => document.getElementById(id);
  const drop = $("drop");
  const input = $("file");
  const PROFILE_KEY = "spotify-persona:profile";
  const MIN_YEAR = 1920;
  let worker = null;
  let stats = null;
  let timeline = null;
  let profile = loadProfile();

  // The profile is a per-viewer convenience, so storage failures (private mode) are fine to ignore.
  function loadProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
      if (saved) {
        // Covers are on unless the user turned them off. Older profiles saved covers: false as a
        // default, so only a choice recorded with coversChosen counts.
        const coversChosen = saved.coversChosen === true;
        return {
          name: saved.name || "",
          birth: saved.birth || null,
          chapters: Array.isArray(saved.chapters) ? saved.chapters : [],
          covers: coversChosen ? saved.covers === true : true,
          coversChosen,
          hiddenArtists: Array.isArray(saved.hiddenArtists) ? saved.hiddenArtists : []
        };
      }
    } catch { /* fall through */ }
    return { name: "", birth: null, chapters: [], covers: true, coversChosen: false, hiddenArtists: [] };
  }

  function setCovers(on) {
    profile.covers = on;
    profile.coversChosen = true;
    saveProfile();
  }

  function saveProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* ignore */ }
  }

  // Cover image URLs by Spotify track ID, so covers show instantly on the next visit.
  const COVER_CACHE_KEY = "spotify-persona:cover-urls";
  const coverCache = (() => {
    let urls = {};
    try { urls = JSON.parse(localStorage.getItem(COVER_CACHE_KEY)) || {}; } catch { urls = {}; }
    return {
      get: id => urls[id],
      set: (id, url) => { urls[id] = url; },
      save: () => { try { localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(urls)); } catch { /* ignore */ } }
    };
  })();

  // One queue for every cover on the page: the loading screen, the cover wall, the palette and song thumbnails.
  const coverQueue = SpotifyPersona.covers.createCoverQueue({ fetchFn: (...args) => fetch(...args), cache: coverCache });

  // While the export loads, the covers of the biggest albums found so far pop in under the progress bar.
  // Once the strip is full, covers that did not fit keep swapping in, so it flashes by until the results show.
  const LOADING_COVERS = 24;
  const LOADING_SWAP_MS = 350;
  let loadingCovers = null;

  function startLoadingCovers() {
    const box = $("loadCovers");
    box.replaceChildren();
    box.hidden = !profile.covers;
    const asked = new Set();
    // Compilation volumes are separate albums that often share one cover, so each image is shown once.
    const shownUrls = new Set();
    const spare = [];

    function coverImg(a, url) {
      const img = Object.assign(document.createElement("img"), { src: url, alt: "", title: `${a.album} · ${a.artist}`, decoding: "async" });
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => img.remove());
      return img;
    }

    const swap = setInterval(() => {
      if (spare.length === 0 || box.children.length < LOADING_COVERS) return;
      const old = box.children[Math.floor(Math.random() * box.children.length)];
      old.replaceWith(spare.shift());
      spare.push(old);
    }, LOADING_SWAP_MS);

    return {
      peek(albums) {
        if (!profile.covers) return;
        for (const a of albums) {
          if (asked.has(a.trackId) || asked.size >= LOADING_COVERS * 2) continue;
          asked.add(a.trackId);
          coverQueue.get(a.trackId).then(url => {
            if (!url || loadingCovers !== this || shownUrls.has(url)) return;
            shownUrls.add(url);
            const img = coverImg(a, url);
            if (box.children.length < LOADING_COVERS) box.append(img);
            else spare.push(img);
          });
        }
      },
      stop() { clearInterval(swap); }
    };
  }

  function stopLoadingCovers() {
    if (loadingCovers) loadingCovers.stop();
    loadingCovers = null;
    $("loadCovers").hidden = true;
    $("loadCovers").replaceChildren();
  }

  function validYear(value) {
    const year = Number(value);
    return Number.isInteger(year) && year >= MIN_YEAR && year <= new Date().getFullYear() ? year : null;
  }

  function show() {
    if (profile.birth) {
      $("bornYear").value = profile.birth.year;
      $("bornMonth").value = profile.birth.month;
      $("bornDay").value = profile.birth.day || "";
    }
    SpotifyPersona.render({
      stats,
      timeline,
      profile,
      persona: SpotifyPersona.persona.buildPersona(stats, profile),
      coverQueue,
      onHideArtist: artist => setHidden(artist, true),
      onToggleCovers: () => {
        setCovers(!profile.covers);
        $("coversCheck").checked = profile.covers;
        show();
      },
      onRemoveChapter: index => {
        profile.chapters.splice(index, 1);
        saveProfile();
        show();
      }
    });
    renderHidden();
    showTab(currentTab, { scroll: false });
  }

  const TABS = ["you", "music", "time", "habits", "life"];
  let currentTab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "you";

  /** Shows one tab's sections and gives the visible ones rotating accent colours. */
  function showTab(name, { scroll = true } = {}) {
    currentTab = TABS.includes(name) ? name : "you";
    for (const b of document.querySelectorAll("#tabs button")) b.setAttribute("aria-selected", String(b.dataset.tab === currentTab));
    let accent = 0;
    for (const section of document.querySelectorAll("#result section[data-tab]")) {
      const on = section.dataset.tab === currentTab;
      section.classList.toggle("off-tab", !on);
      if (on && !section.hidden) section.dataset.accent = String(accent++ % 6 + 1);
    }
    try { history.replaceState(null, "", `#${currentTab}`); } catch { /* not allowed in some sandboxes */ }
    if (scroll) window.scrollTo(0, 0);
  }
  for (const b of document.querySelectorAll("#tabs button")) b.addEventListener("click", () => showTab(b.dataset.tab));
  window.SpotifyPersona.showTab = showTab;

  // The worker stays alive after loading: it keeps the parsed history, so a new year range only re-aggregates.
  let years = [];

  /**
   * Year ticker: one chip per year from the first stream to the last. Tap a year to pick it alone, then
   * tap another to stretch to a range; tapping the lone picked year again goes back to all time. With a
   * mouse you can also drag across years. Arrow keys move between chips, Shift+arrow stretches the range.
   */
  function setupYearTicker() {
    const min = years[0], max = years[years.length - 1];
    const box = $("tickerYears"), allButton = $("rangeAll");
    let from = min, to = max, anchor = null, drag = null, skipClick = false;
    currentRange = { fromYear: min, toYear: max };
    $("yearTicker").hidden = min === max;

    const buttons = [];
    for (let year = min; year <= max; year++) {
      const b = Object.assign(document.createElement("button"), { type: "button", textContent: `'${String(year).slice(2)}`, title: String(year) });
      b.dataset.year = year;
      b.setAttribute("aria-label", String(year));
      buttons.push(b);
    }
    box.replaceChildren(...buttons);
    const yearOf = el => Number(el?.closest?.("#tickerYears button")?.dataset.year) || null;

    const paint = () => {
      const all = from === min && to === max;
      allButton.setAttribute("aria-pressed", String(all));
      for (const b of buttons) {
        const year = Number(b.dataset.year), on = !all && year >= from && year <= to;
        b.classList.toggle("in", on);
        b.classList.toggle("first", on && year === from);
        b.classList.toggle("last", on && year === to);
        b.setAttribute("aria-pressed", String(on));
      }
      // Keeps the picked stretch in view without moving the page.
      const first = buttons[from - min];
      if (!all && (first.offsetLeft < box.scrollLeft || first.offsetLeft + first.offsetWidth > box.scrollLeft + box.clientWidth)) {
        box.scrollLeft = first.offsetLeft - box.clientWidth / 3;
      }
    };
    const select = (a, b, { apply = true } = {}) => {
      [from, to] = [Math.min(a, b), Math.max(a, b)];
      paint();
      if (apply && (from !== currentRange.fromYear || to !== currentRange.toYear)) requestRange(from, to);
    };

    allButton.onclick = () => { anchor = null; select(min, max); };
    box.onclick = e => {
      const year = yearOf(e.target);
      if (!year) return;
      if (skipClick) { skipClick = false; return; }
      if (anchor !== null && from === to && from === anchor && year !== anchor) select(anchor, year);
      else if (from === to && year === from) { anchor = null; select(min, max); }
      else { anchor = year; select(year, year); }
    };
    box.onpointerdown = e => {
      if (e.pointerType !== "mouse" || e.button !== 0 || !yearOf(e.target)) return;
      drag = { start: yearOf(e.target), moved: false };
      // Listens on the window, so letting go outside the ticker still ends the drag.
      window.addEventListener("pointerup", () => {
        if (drag.moved) { skipClick = true; anchor = null; select(from, to); }
        drag = null;
      }, { once: true });
    };
    box.onpointerover = e => {
      const year = yearOf(e.target);
      if (!drag || !year || (year === drag.start && !drag.moved)) return;
      drag.moved = true;
      select(drag.start, year, { apply: false });
    };
    box.onkeydown = e => {
      const year = yearOf(e.target);
      if (!year || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      const next = buttons[year - min + (e.key === "ArrowLeft" ? -1 : 1)];
      if (!next) return;
      e.preventDefault();
      next.focus();
      if (e.shiftKey) {
        if (anchor === null) anchor = year;
        select(anchor, Number(next.dataset.year));
      }
    };
    paint();
  }

  let currentRange = {};

  function requestRange(fromYear, toYear) {
    currentRange = { fromYear, toYear };
    $("result").classList.add("updating");
    $("rangeStatus").textContent = "Updating...";
    worker.postMessage({ type: "range", fromYear, toYear, hiddenArtists: profile.hiddenArtists });
  }

  function setHidden(artist, hide) {
    const list = profile.hiddenArtists.filter(a => a !== artist);
    if (hide) list.push(artist);
    profile.hiddenArtists = list;
    saveProfile();
    requestRange(currentRange.fromYear, currentRange.toYear);
  }

  /** Chips for hidden artists in the sticky bar; clicking one brings the artist back. */
  function renderHidden() {
    const box = $("hiddenArtists");
    box.hidden = profile.hiddenArtists.length === 0;
    box.replaceChildren(
      Object.assign(document.createElement("span"), { textContent: "Hidden:" }),
      ...profile.hiddenArtists.map(artist => {
        const b = Object.assign(document.createElement("button"), { type: "button", textContent: `${artist} ×`, title: `Show ${artist} again` });
        b.setAttribute("aria-label", `Show ${artist} again`);
        b.addEventListener("click", () => setHidden(artist, false));
        return b;
      })
    );
  }

  function analyzeFile(file) {
    if (!file) return;
    if (worker) worker.terminate();
    let firstLoad = true;
    $("progress").hidden = false;
    $("bar").style.width = "0%";
    setStatus("Unzipping...");
    stopLoadingCovers();
    loadingCovers = startLoadingCovers();
    // Brings the progress bar and the covers below it into view; they sit under the fold on most screens.
    drop.scrollIntoView({ block: "start" });
    worker = new Worker("src/worker.js");
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        $("bar").style.width = `${data.done / data.total * 100}%`;
        setStatus(data.phase === "analyze" ? "Working out your persona..." : `Reading file ${data.done} of ${data.total}...`);
      } else if (data.type === "peek") {
        if (loadingCovers) loadingCovers.peek(data.albums);
      } else if (data.type === "done") {
        stats = data.stats;
        timeline = data.timeline;
        $("result").classList.remove("updating");
        $("rangeStatus").textContent = "";
        if (firstLoad) {
          firstLoad = false;
          years = data.years;
          setupYearTicker();
          show();
          stopLoadingCovers();
          $("upload").hidden = true;
          $("result").hidden = false;
          window.scrollTo(0, 0);
        } else {
          show();
        }
      } else if (data.type === "error") {
        if (firstLoad) {
          worker.terminate();
          stopLoadingCovers();
          $("progress").hidden = true;
          setStatus(data.message, true);
        } else {
          $("result").classList.remove("updating");
          $("rangeStatus").textContent = data.message;
        }
      }
    };
    worker.postMessage({ type: "load", file, hiddenArtists: profile.hiddenArtists, peek: profile.covers });
  }

  function setStatus(text, isError = false) {
    $("status").textContent = text;
    $("status").classList.toggle("error", isError);
  }

  /** Adds the flag and Spotify's own label(s) in the visitor's language next to each English box name. */
  function localizeSteps() {
    const { detectCountry, labelsFor, flagOf } = SpotifyPersona.locale;
    let timeZone = "";
    try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { /* keep empty */ }
    const country = detectCountry({ timeZone, languages: navigator.languages || [navigator.language] });
    const labels = labelsFor(country);
    for (const slot of document.querySelectorAll(".steps .local")) {
      const known = labels.filter(l => l[slot.dataset.label]);
      if (known.length === 0) continue;
      const parts = [" (", Object.assign(document.createElement("i"), { className: "flag", textContent: flagOf(country) }), " "];
      known.forEach((l, i) => {
        if (i > 0) parts.push(" / ");
        parts.push(Object.assign(document.createElement("b"), { lang: l.lang, textContent: l[slot.dataset.label] }));
      });
      parts.push(")");
      slot.replaceChildren(...parts);
    }
  }
  localizeSteps();

  $("userName").value = profile.name;
  $("userName").addEventListener("change", () => {
    profile.name = $("userName").value.trim().slice(0, 40);
    saveProfile();
    if (stats) show();
  });

  $("coversCheck").checked = profile.covers;
  $("coversCheck").addEventListener("change", () => {
    setCovers($("coversCheck").checked);
    $("loadCovers").hidden = !profile.covers || !loadingCovers;
  });

  input.addEventListener("change", () => analyzeFile(input.files[0]));
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => {
    e.preventDefault();
    drop.classList.remove("over");
    analyzeFile(e.dataTransfer.files[0]);
  });

  $("bornForm").addEventListener("submit", e => {
    e.preventDefault();
    const year = validYear($("bornYear").value);
    if (!year) {
      $("lifeNote").textContent = `Enter a birth year between ${MIN_YEAR} and ${new Date().getFullYear()}.`;
      return;
    }
    const month = Number($("bornMonth").value);
    const day = $("bornDay").value ? Number($("bornDay").value) : null;
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day !== null && (!Number.isInteger(day) || day < 1 || day > daysInMonth)) {
      $("lifeNote").textContent = `Enter a day between 1 and ${daysInMonth}, or leave it empty.`;
      return;
    }
    profile.birth = day ? { year, month, day } : { year, month };
    saveProfile();
    show();
    $("life").scrollIntoView({ block: "start" });
  });

  $("chapterForm").addEventListener("submit", e => {
    e.preventDefault();
    const label = $("chapterLabel").value.trim();
    const from = validYear($("chapterFrom").value);
    const to = validYear($("chapterTo").value || $("chapterFrom").value);
    let error = "";
    if (!label) error = "Give the chapter a name, like a country or a school.";
    else if (!from || !to) error = `Use years between ${MIN_YEAR} and ${new Date().getFullYear()}.`;
    else if (from > to) error = "The start year has to come before the end year.";
    $("chapterError").textContent = error;
    if (error) return;
    profile.chapters.push({ kind: $("chapterKind").value, label, from, to });
    profile.chapters.sort((a, b) => a.from - b.from);
    saveProfile();
    $("chapterLabel").value = $("chapterFrom").value = $("chapterTo").value = "";
    show();
  });

  $("again").addEventListener("click", () => {
    if (worker) { worker.terminate(); worker = null; }
    input.value = "";
    $("progress").hidden = true;
    setStatus("");
    $("result").hidden = true;
    $("upload").hidden = false;
    document.title = "Spotify Persona";
  });

  // Exposed for scripted testing against a local zip.
  window.SpotifyPersona.analyzeFile = analyzeFile;
})();
