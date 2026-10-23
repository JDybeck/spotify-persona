// Wires the upload screen to the worker and swaps to the results when analysis is done.
(function () {
  const $ = id => document.getElementById(id);
  const drop = $("drop");
  const input = $("file");
  const BIRTH_KEY = "spotify-persona:birth";
  let worker = null;
  let stats = null;

  // The birth date is a per-viewer convenience, so storage failures (private mode) are fine to ignore.
  function loadBirth() {
    try {
      const birth = JSON.parse(localStorage.getItem(BIRTH_KEY));
      return birth && birth.year && birth.month ? birth : null;
    } catch {
      return null;
    }
  }

  function saveBirth(birth) {
    try { localStorage.setItem(BIRTH_KEY, JSON.stringify(birth)); } catch { /* ignore */ }
  }

  function readBirthForm() {
    const year = Number($("bornYear").value);
    const month = Number($("bornMonth").value);
    const thisYear = new Date().getFullYear();
    if (!Number.isInteger(year) || year < 1920 || year > thisYear) return null;
    return { year, month };
  }

  function show(birth) {
    if (birth) {
      $("bornYear").value = birth.year;
      $("bornMonth").value = birth.month;
    }
    SpotifyPersona.render(stats, SpotifyPersona.persona.buildPersona(stats, birth));
  }

  function setStatus(text, isError = false) {
    $("status").textContent = text;
    $("status").classList.toggle("error", isError);
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
        show(loadBirth());
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
    const birth = readBirthForm();
    if (!birth) {
      $("lifeNote").textContent = `Enter a birth year between 1920 and ${new Date().getFullYear()}.`;
      return;
    }
    saveBirth(birth);
    show(birth);
    $("life").scrollIntoView({ block: "start" });
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
