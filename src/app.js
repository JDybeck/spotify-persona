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
      if (saved) return { name: saved.name || "", birth: saved.birth || null, chapters: Array.isArray(saved.chapters) ? saved.chapters : [], covers: saved.covers === true };
    } catch { /* fall through */ }
    return { name: "", birth: null, chapters: [], covers: false };
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
      coverCache,
      onToggleCovers: () => {
        profile.covers = !profile.covers;
        saveProfile();
        show();
      },
      onRemoveChapter: index => {
        profile.chapters.splice(index, 1);
        saveProfile();
        show();
      }
    });
  }

  // The worker stays alive after loading: it keeps the parsed history, so a new year range only re-aggregates.
  let years = [];

  function rangeLabel(from, to) {
    const all = from === years[0] && to === years[years.length - 1];
    return `${from === to ? from : `${from}–${to}`}${all ? " · all time" : ""}`;
  }

  function setupYearSlider() {
    const fromInput = $("rangeFrom"), toInput = $("rangeTo");
    const min = years[0], max = years[years.length - 1];
    for (const input of [fromInput, toInput]) { input.min = min; input.max = max; input.step = 1; }
    fromInput.value = min;
    toInput.value = max;
    $("yearRange").hidden = min === max;

    const paint = () => {
      const from = Number(fromInput.value), to = Number(toInput.value), span = Math.max(max - min, 1);
      $("rangeTrack").style.setProperty("--a", `${(from - min) / span * 100}%`);
      $("rangeTrack").style.setProperty("--b", `${(to - min) / span * 100}%`);
      $("rangeLabel").textContent = rangeLabel(from, to);
      $("rangeAll").hidden = from === min && to === max;
    };
    // The handles cannot cross: dragging one past the other stops at it.
    fromInput.oninput = () => { if (Number(fromInput.value) > Number(toInput.value)) fromInput.value = toInput.value; paint(); };
    toInput.oninput = () => { if (Number(toInput.value) < Number(fromInput.value)) toInput.value = fromInput.value; paint(); };
    const apply = () => requestRange(Number(fromInput.value), Number(toInput.value));
    fromInput.onchange = apply;
    toInput.onchange = apply;
    $("rangeAll").onclick = () => { fromInput.value = min; toInput.value = max; paint(); apply(); };
    paint();
  }

  function requestRange(fromYear, toYear) {
    $("result").classList.add("updating");
    $("rangeStatus").textContent = "Updating...";
    worker.postMessage({ type: "range", fromYear, toYear });
  }

  function analyzeFile(file) {
    if (!file) return;
    if (worker) worker.terminate();
    let firstLoad = true;
    $("progress").hidden = false;
    $("bar").style.width = "0%";
    setStatus("Unzipping...");
    worker = new Worker("src/worker.js");
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        $("bar").style.width = `${data.done / data.total * 100}%`;
        setStatus(`Reading file ${data.done} of ${data.total}...`);
      } else if (data.type === "done") {
        stats = data.stats;
        timeline = data.timeline;
        $("result").classList.remove("updating");
        $("rangeStatus").textContent = "";
        if (firstLoad) {
          firstLoad = false;
          years = data.years;
          setupYearSlider();
          show();
          $("upload").hidden = true;
          $("result").hidden = false;
          window.scrollTo(0, 0);
        } else {
          show();
        }
      } else if (data.type === "error") {
        if (firstLoad) {
          worker.terminate();
          $("progress").hidden = true;
          setStatus(data.message, true);
        } else {
          $("result").classList.remove("updating");
          $("rangeStatus").textContent = data.message;
        }
      }
    };
    worker.postMessage(file);
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
