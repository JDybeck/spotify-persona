// Wires the upload screen to the worker, keeps the user's profile (birth date, chapters) and re-renders on changes.
(function () {
  const $ = id => document.getElementById(id);
  const drop = $("drop");
  const input = $("file");
  const PROFILE_KEY = "spotify-persona:profile";
  const MIN_YEAR = 1920;
  let worker = null;
  let stats = null;
  let profile = loadProfile();

  // The profile is a per-viewer convenience, so storage failures (private mode) are fine to ignore.
  function loadProfile() {
    try {
      const saved = JSON.parse(localStorage.getItem(PROFILE_KEY));
      if (saved) return { birth: saved.birth || null, chapters: Array.isArray(saved.chapters) ? saved.chapters : [] };
    } catch { /* fall through */ }
    return { birth: null, chapters: [] };
  }

  function saveProfile() {
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* ignore */ }
  }

  function validYear(value) {
    const year = Number(value);
    return Number.isInteger(year) && year >= MIN_YEAR && year <= new Date().getFullYear() ? year : null;
  }

  function show() {
    if (profile.birth) {
      $("bornYear").value = profile.birth.year;
      $("bornMonth").value = profile.birth.month;
    }
    const persona = SpotifyPersona.persona.buildPersona(stats, profile);
    SpotifyPersona.render(stats, persona, {
      onRemoveChapter: index => {
        profile.chapters.splice(index, 1);
        saveProfile();
        show();
      }
    });
  }

  function analyzeFile(file) {
    if (!file) return;
    if (worker) worker.terminate();
    $("progress").hidden = false;
    $("bar").style.width = "0%";
    setStatus("Unzipping...");
    worker = new Worker("src/worker.js");
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        $("bar").style.width = `${data.done / data.total * 100}%`;
        setStatus(`Reading file ${data.done} of ${data.total}...`);
      } else if (data.type === "done") {
        worker.terminate();
        stats = data.stats;
        show();
        $("upload").hidden = true;
        $("result").hidden = false;
        window.scrollTo(0, 0);
      } else if (data.type === "error") {
        worker.terminate();
        $("progress").hidden = true;
        setStatus(data.message, true);
      }
    };
    worker.postMessage(file);
  }

  function setStatus(text, isError = false) {
    $("status").textContent = text;
    $("status").classList.toggle("error", isError);
  }

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
    profile.birth = { year, month: Number($("bornMonth").value) };
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
