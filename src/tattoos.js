// Tattoo ideas drawn from the listening history: the overall theme, the one artist and song that
// matter most, and a ranked list of concepts that each point back at a real number in the export.
// Pure logic with no DOM access, shared by the page and the Node tests.
(function (root, factory) {
  const isNode = typeof module === "object" && module.exports;
  const api = factory(isNode ? require("./genres.js") : root.SpotifyPersona.genres);
  if (isNode) module.exports = api;
  else root.SpotifyPersona.tattoos = api;
})(typeof self !== "undefined" ? self : this, function ({ GENRES }) {
  const IDEA_COUNT = 15;

  // How each genre tends to look in ink: a motif, a style that fits the scene, and a short mood line.
  const GENRE_INK = {
    core:   { motif: "a cracked heart wrapped in barbed wire, with a lightning bolt through the crack", style: "Neo-traditional", mood: "loud, heavy and secretly sentimental" },
    punk:   { motif: "a swallow carrying a safety pin", style: "American traditional", mood: "fast, loud and full of feelings" },
    metal:  { motif: "a horned skull over crossed lightning bolts", style: "Blackwork", mood: "dark, heavy and riff-first" },
    rock:   { motif: "a lightning bolt splitting a guitar headstock", style: "Traditional", mood: "big choruses and classic riffs" },
    indie:  { motif: "a single-line mountain range with a fern growing out of it", style: "Fine line", mood: "quiet, wistful and a little ahead of the curve" },
    edm:    { motif: "a sine wave that turns into a sharp geometric drop", style: "Geometric dotwork", mood: "built for the build and the drop" },
    pop:    { motif: "a cherry with sparkles and a tiny heart", style: "Fine line colour", mood: "bright, catchy and unapologetic" },
    hiphop: { motif: "a crown resting on a vintage microphone", style: "Black and grey realism", mood: "bars, beats and confidence" },
    chill:  { motif: "a striped retro sun setting over a neon grid with one palm tree", style: "Neon colour, synthwave", mood: "night drives and reverb" },
    score:  { motif: "a treble clef that turns into a sword hilt", style: "Ornamental fine line", mood: "cinematic, epic and story-driven" }
  };
  const DEFAULT_INK = { motif: "a pair of headphones drawn in one continuous line", style: "Fine line", mood: "all over the map, in the best way" };

  // A symbol for the habit that names the archetype.
  const HABIT_INK = {
    loyalty:   { symbol: "an anchor", meaning: "you stay with your artists for years" },
    explorer:  { symbol: "a compass rose", meaning: "you keep heading somewhere new" },
    night:     { symbol: "an owl under a crescent moon", meaning: "the music gets louder after dark" },
    skipper:   { symbol: "a skip-forward arrow ⏭ in bold outline", meaning: "a song gets ten seconds to prove itself" },
    shuffle:   { symbol: "a pair of dice mid-roll, showing a shuffle arrow on one face", meaning: "you trust the shuffle" },
    obsession: { symbol: "an infinity sign drawn as a looping cassette tape", meaning: "when a song hits, it stays on repeat" }
  };

  const SEASON_INK = {
    summer: "a sun", winter: "a snowflake", spring: "a sprouting flower", autumn: "a falling maple leaf"
  };

  const fmt = n => Math.round(n).toLocaleString("sv-SE");

  /** "Bring Me The Horizon" → "BMTH". Single words keep their first three letters: "deadmau5" → "DEA". */
  function initials(name) {
    const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
    if (words.length === 0) return name.slice(0, 3).toUpperCase();
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words.map(w => w[0]).join("").toUpperCase().slice(0, 5);
  }

  function roman(n) {
    if (!Number.isInteger(n) || n <= 0 || n >= 4000) return String(n);
    const table = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let out = "";
    for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
    return out;
  }

  /** "2024-03-07" → "07.03.24", the usual way dates are inked. */
  function inkDate(iso) {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y.slice(2)}`;
  }

  /** What to letter for an artist: a short name in full, a long one as initials. */
  const mark = name => (name.length <= 12 ? name.toUpperCase() : initials(name));

  /** "4 groups of tally marks plus 3" in words that read right for 1 and for exact fives. */
  function tally(n) {
    const groups = Math.floor(n / 5), rest = n % 5;
    const parts = [];
    if (groups) parts.push(`${groups} ${groups === 1 ? "group" : "groups"} of five tally marks`);
    if (rest) parts.push(groups ? `plus ${rest} single ${rest === 1 ? "mark" : "marks"}` : `${rest} tally ${rest === 1 ? "mark" : "marks"}`);
    return parts.join(" ");
  }

  const inkOf = genre => (genre && GENRE_INK[genre]) || DEFAULT_INK;
  const pad = h => String(h).padStart(2, "0");

  /** The song that matters most: played over the most years among the top songs, else the most played. */
  function specialSong(stats, persona) {
    const comfort = persona.vibes && persona.vibes.vibes.find(v => v.key === "comfort");
    const top = stats.topTracks[0];
    if (comfort && comfort.songs.length) {
      const s = comfort.songs[0];
      const plays = (stats.topTracks.find(t => t.track === s.track && t.artist === s.artist) || {}).plays;
      return { track: s.track, artist: s.artist, why: `With you for ${s.detail}${plays ? `, ${fmt(plays)} plays` : ""}. Not just a favourite, a constant.` };
    }
    if (top) return { track: top.track, artist: top.artist, why: `Your most played song: ${fmt(top.plays)} plays.` };
    return null;
  }

  function specialArtist(stats) {
    const a = stats.topArtists[0];
    if (!a) return null;
    const share = stats.totalHours ? a.hours / stats.totalHours : 0;
    const yearsTopped = stats.years.filter(y => y.topArtists[0] && y.topArtists[0].name === a.name).length;
    const parts = [`${fmt(a.hours)} hours, ${Math.round(share * 100)}% of everything you played`];
    if (yearsTopped > 1) parts.push(`number one in ${yearsTopped} different years`);
    return { name: a.name, hours: a.hours, share, why: `${parts.join(", ")}.` };
  }

  /** One line on what ties the history together, built from the main genre, the archetype habit and how concentrated the taste is. */
  function theme(stats, persona) {
    const genre = persona.archetype.genre;
    const ink = inkOf(genre);
    const habit = HABIT_INK[persona.archetype.habit] || HABIT_INK.explorer;
    const second = persona.mix.shares[1];
    const [first, noun] = persona.archetype.title;
    const focused = stats.top10Share >= 0.5;
    const lines = [
      genre ? `${GENRES[genre].label} runs through everything: ${ink.mood}.` : `No single genre owns you: ${DEFAULT_INK.mood}.`,
      `The habit that stands out is that ${habit.meaning}.`,
      focused
        ? `Your top 10 artists make up ${Math.round(stats.top10Share * 100)}% of your listening, so a tattoo built around a few names would feel true.`
        : `Your top 10 artists are only ${Math.round(stats.top10Share * 100)}% of your listening, so a symbol for a whole sound may fit better than one name.`
    ];
    if (second && genre) lines.splice(1, 0, `${second.label} is the second thread.`);
    const styleWhy = genre
      ? `The look that suits ${GENRES[genre].label.replace(/^[A-Z][a-z]/, c => c.toLowerCase())}: ${ink.mood}.`
      : "Clean and open, since your taste spans too much for one scene.";
    return { title: `The ${first} ${noun}`, style: ink.style, styleWhy, text: lines.join(" ") };
  }

  /** Every idea generator returns null when the export lacks what it needs, so the list fills from the rest. */
  function candidates(stats, persona, song, artist) {
    const genre = persona.archetype.genre;
    const ink = inkOf(genre);
    const habits = stats.habits || {};
    const habit = HABIT_INK[persona.archetype.habit] || HABIT_INK.explorer;
    const [word, noun] = persona.archetype.title;
    const ideas = [];
    const push = idea => idea && ideas.push(idea);

    // 1. The headliner.
    push(artist && {
      key: "headliner", title: `${artist.name}, in ink`,
      basis: artist.why,
      design: `${ink.motif[0].toUpperCase()}${ink.motif.slice(1)}. Work "${mark(artist.name)}" into the linework, small enough that only fans will spot it.`,
      style: ink.style, placement: "Forearm", size: "Medium"
    });

    // 2. The song.
    push(song && {
      key: "song", title: `"${song.track}"`,
      basis: song.why,
      design: `The song title in typewriter lettering above a short sound wave. Pick the one line you always sing loudest and put it underneath in your own handwriting.`,
      style: "Fine line script", placement: "Inner arm or collarbone", size: "Small"
    });

    // 3. The archetype as a flash piece.
    push({
      key: "archetype", title: `${word} ${noun} flash`,
      basis: `Your listener archetype. The ${noun.toLowerCase()} part means ${habit.meaning}.`,
      design: `${habit.symbol[0].toUpperCase()}${habit.symbol.slice(1)} with a banner across it reading "${word.toUpperCase()} ${noun.toUpperCase()}".`,
      style: "American traditional flash", placement: "Calf or upper arm", size: "Medium"
    });

    // 4. Hours per year as an equalizer.
    const years = stats.years.filter(y => y.hours > 0);
    push(years.length >= 3 && {
      key: "equalizer", title: "Your years as an equalizer",
      basis: `${years.length} years of listening, from ${fmt(Math.min(...years.map(y => y.hours)))} to ${fmt(Math.max(...years.map(y => y.hours)))} hours a year.`,
      design: `A row of ${years.length} equalizer bars, one per year from ${years[0].year} to ${years[years.length - 1].year}, each as tall as the hours you played that year. Your own listening, drawn to scale.`,
      style: "Minimal blackwork", placement: "Wrist or ankle", size: "Small",
      bars: years.map(y => ({ year: y.year, hours: y.hours }))
    });

    // 5. The eras as a band around the arm.
    const eras = persona.eras || [];
    push(eras.length >= 2 && {
      key: "eras", title: "The eras armband",
      basis: `${eras.length} eras: ${eras.map(e => `${e.name.replace(/^The /, "")} (${e.from === e.to ? e.from : `${e.from}–${e.to}`})`).join(", ")}.`,
      design: `A thin band around the arm split into ${eras.length} segments, each holding a small symbol for its era: ${eras.map(e => inkOf(e.genre).motif.split(",")[0].replace(/^an? /, "")).join(" → ")}.`,
      style: "Blackwork ornamental", placement: "Upper arm band", size: "Large"
    });

    // 6. Peak listening hour as a clock.
    if (stats.hours && stats.hours.some(h => h > 0)) {
      const peak = stats.hours.indexOf(Math.max(...stats.hours));
      const night = peak >= 22 || peak < 4;
      push({
        key: "clock", title: `${pad(peak)}:00`,
        basis: `${pad(peak)}:00 is the hour you listen the most, ${fmt(stats.hours[peak])} hours in total.`,
        design: `A pocket watch stopped at ${pad(peak)}:00, with a vinyl record for a face${night ? " and a crescent moon in the background" : ""}.`,
        style: "Black and grey realism", placement: "Back of the hand or shoulder", size: "Small to medium"
      });
    }

    // 7. Tally marks for the biggest repeat day.
    const o = stats.obsessions && stats.obsessions[0];
    push(o && o.plays >= 5 && {
      key: "tally", title: `${o.plays}× in one day`,
      basis: `On ${o.day} you played "${o.track}" by ${o.artist} ${o.plays} times.`,
      design: `${tally(o.plays)}, with the date ${inkDate(o.day)} underneath. A joke only you get.`,
      style: "Stick and poke", placement: "Finger, ankle or ribs", size: "Tiny"
    });

    // 8. Where it started.
    push(stats.firstTrack && {
      key: "first", title: "Track 1",
      basis: `The first stream in your history: "${stats.firstTrack.track}" by ${stats.firstTrack.artist}, on ${stats.first}.`,
      design: `A vinyl label reading "SIDE A · TRACK 1" with ${inkDate(stats.first)} around the rim. The song stays your secret.`,
      style: "Fine line", placement: "Behind the ear or inner wrist", size: "Tiny"
    });

    // 9. A lineup poster block.
    const headliners = stats.topArtists.slice(0, 3);
    push(headliners.length === 3 && {
      key: "lineup", title: "Personal festival poster",
      basis: `Your three biggest artists: ${headliners.map(a => `${a.name} (${fmt(a.hours)} h)`).join(", ")}.`,
      design: `A mini gig poster: ${headliners.map(a => a.name.toUpperCase()).join(" / ")} stacked in condensed block letters, each line sized by hours played, over a ${genre === "chill" ? "neon sunset" : "stage spotlight"}.`,
      style: "Lettering, illustrative", placement: "Thigh or back", size: "Large"
    });

    // 10. The comeback.
    const cb = habits.comebacks && habits.comebacks[0];
    push(cb && {
      key: "comeback", title: "The comeback",
      basis: `"${cb.track}" by ${cb.artist} went silent for ${cb.silentYears} years after ${cb.lastYear}, then came back in ${cb.backYear}.`,
      design: `A phoenix rising out of a cassette tape, with "${cb.lastYear} · ${cb.backYear}" on the unspooled tape.`,
      style: "Neo-traditional", placement: "Shoulder blade", size: "Medium"
    });

    // 11. Longest daily streak in roman numerals.
    const streak = habits.streaks && habits.streaks.longest;
    push(streak && streak.days >= 7 && {
      key: "streak", title: roman(streak.days),
      basis: `Your longest daily streak: ${fmt(streak.days)} days in a row with music, ${streak.from} to ${streak.to}.`,
      design: `"${roman(streak.days)}" in thin serif capitals, with a small play symbol ▶ in place of a dot.`,
      style: "Fine line lettering", placement: "Collarbone or forearm", size: "Small"
    });

    // 12. The seasonal artist.
    const seasonal = habits.seasons && habits.seasons.seasonal && habits.seasons.seasonal[0];
    push(seasonal && {
      key: "season", title: `${seasonal.name}, every ${seasonal.season}`,
      basis: `${Math.round(seasonal.share * 100)}% of your ${fmt(seasonal.plays)} plays of ${seasonal.name} happen in ${seasonal.season}.`,
      design: `${SEASON_INK[seasonal.season][0].toUpperCase()}${SEASON_INK[seasonal.season].slice(1)} with "${mark(seasonal.name)}" hidden in its centre.`,
      style: "Fine line colour", placement: "Ankle", size: "Tiny"
    });

    // 13. The longest-loyal artist, if it is not already the headliner.
    const loyal = [...stats.topArtists.slice(0, 30)].sort((a, b) => b.years - a.years || b.hours - a.hours)[0];
    push(loyal && loyal.years >= 4 && (!artist || loyal.name !== artist.name) && {
      key: "loyal", title: `${loyal.years} years of ${loyal.name}`,
      basis: `${loyal.name} has been in your rotation for ${loyal.years} different years, ${fmt(loyal.hours)} hours in all.`,
      design: `An anchor whose rope spells "${mark(loyal.name)}", with ${roman(loyal.years)} on the crown.`,
      style: "Traditional", placement: "Forearm", size: "Small to medium"
    });

    // 14. The new chapter: who rules the last 12 months, if different from all time.
    const recent = stats.recentArtists && stats.recentArtists[0];
    push(recent && artist && recent.name !== artist.name && {
      key: "recent", title: `Now playing: ${recent.name}`,
      basis: `${recent.name} is your biggest artist of the last 12 months (${fmt(recent.hours)} h), ahead of your all-time number one.`,
      design: `A small "now playing" bar: a progress line with the dot halfway, and "${mark(recent.name)}" above it. Marks where you are right now.`,
      style: "Minimal fine line", placement: "Inner forearm", size: "Small"
    });

    // 15. Genre fusion.
    const [g1, g2] = persona.mix.shares;
    push(g1 && g2 && GENRE_INK[g1.key] && GENRE_INK[g2.key] && {
      key: "fusion", title: `${GENRES[g1.key].word} meets ${GENRES[g2.key].word}`,
      basis: `Your top two genres: ${GENRES[g1.key].label} (${Math.round(g1.share * 100)}%) and ${GENRES[g2.key].label} (${Math.round(g2.share * 100)}%).`,
      design: `Split down the middle: ${GENRE_INK[g1.key].motif.split(",")[0]} on one half, ${GENRE_INK[g2.key].motif.split(",")[0]} on the other, sharing one outline.`,
      style: `${GENRE_INK[g1.key].style} × ${GENRE_INK[g2.key].style}`, placement: "Calf", size: "Medium to large"
    });

    // 16. New Year's song from the latest year.
    const ny = habits.newYear && habits.newYear[habits.newYear.length - 1];
    push(ny && {
      key: "newyear", title: `First song of ${ny.year}`,
      basis: `You started ${ny.year} with "${ny.track}" by ${ny.artist}, at ${ny.time} on ${ny.date}.`,
      design: `A burst of fireworks drawn as a sound wave, with ${ny.year} in the smoke. A fresh-start piece.`,
      style: "Fine line", placement: "Ribs", size: "Small"
    });

    // 17. Total hours as a barcode.
    push(stats.totalHours >= 10 && {
      key: "barcode", title: `${fmt(stats.totalHours)} hours`,
      basis: `${fmt(stats.totalHours)} hours of music, about ${fmt(stats.totalHours / 24)} days nonstop.`,
      design: `A barcode whose numbers read ${Math.round(stats.totalHours)}, with the bars fading into a sound wave on one side.`,
      style: "Blackwork", placement: "Back of the neck", size: "Small"
    });

    // 18. The marathon session.
    const longest = habits.sessions && habits.sessions.longest;
    push(longest && longest.hours >= 2 && {
      key: "marathon", title: "The marathon",
      basis: `Your longest session: ${fmt(longest.hours)} hours straight on ${longest.date}, starting at ${longest.startTime}.`,
      design: `An hourglass with headphones draped over it, the sand made of tiny notes, ${roman(Math.round(longest.hours))} on the base.`,
      style: "Illustrative", placement: "Forearm", size: "Medium"
    });

    // 19. The phase song, for the self-aware.
    const phase = persona.vibes && persona.vibes.vibes.find(v => v.key === "phase");
    push(phase && phase.songs[0] && {
      key: "phase", title: "It was a phase",
      basis: `"${phase.songs[0].track}" by ${phase.songs[0].artist}: ${phase.songs[0].detail}.`,
      design: `A tiny moon in its phases, one of them filled in, with "${phase.songs[0].detail.match(/\d{4}$/) ? phase.songs[0].detail.match(/\d{4}$/)[0] : "no regrets"}" under it. For the version of you that played it to death.`,
      style: "Fine line", placement: "Finger or ankle", size: "Tiny"
    });

    // 20. The song with the most hours, when it is not already the special song.
    const lt = stats.longestTrack;
    push(lt && lt.hours >= 1 && (!song || lt.track !== song.track || lt.artist !== song.artist) && {
      key: "hours-song", title: `${fmt(lt.hours)} hours of one song`,
      basis: `"${lt.track}" by ${lt.artist} has the most total time of any song: ${fmt(lt.hours)} hours.`,
      design: `A cassette with the tape pulled out and wound into the shape of a heart, the label reading "${lt.track.toUpperCase()}".`,
      style: "Neo-traditional", placement: "Forearm or calf", size: "Small to medium"
    });

    // 21. The busiest weekday.
    if (stats.weekdays && stats.weekdays.some(h => h > 0)) {
      const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      const d = stats.weekdays.indexOf(Math.max(...stats.weekdays));
      push({
        key: "weekday", title: `${DAYS[d]} is for music`,
        basis: `${DAYS[d]} is your biggest listening day of the week, ${fmt(stats.weekdays[d])} hours in total.`,
        design: `Seven small dots in a row for the days of the week, with the ${d + 1}${["st", "nd", "rd"][d] || "th"} one drawn as a tiny speaker.`,
        style: "Minimal dotwork", placement: "Finger or wrist", size: "Tiny"
      });
    }

    // 22. The artist you always skip, for the self-aware.
    const skipped = stats.hasBehaviorData && stats.skippedArtists && stats.skippedArtists[0];
    push(skipped && skipped.rate >= 0.4 && {
      key: "skipped", title: "Next track, please",
      basis: `You skip ${skipped.name} ${Math.round(skipped.rate * 100)}% of the time, ${fmt(skipped.skips)} skips out of ${fmt(skipped.starts)} starts.`,
      design: `A bold skip-forward symbol ⏭ with a tiny "sorry" in script underneath. A tattoo about taste, not about them.`,
      style: "Traditional", placement: "Thumb or inner finger", size: "Tiny"
    });

    // 23. Discovery count, always available.
    push({
      key: "compass", title: `${fmt(stats.distinctArtists)} artists`,
      basis: `You have played ${fmt(stats.distinctArtists)} different artists and ${fmt(stats.distinctTracks)} different songs.`,
      design: `A compass rose where the needle is a guitar pick, with ${fmt(stats.distinctArtists)} in small numerals at north.`,
      style: "Dotwork", placement: "Shoulder", size: "Medium"
    });

    return ideas;
  }

  /** Theme, special artist and song, and up to 15 ideas. Expects stats from analyze (+ optional habits) and a persona. */
  function tattooIdeas(stats, persona) {
    if (!stats || !stats.topArtists || stats.topArtists.length === 0) return null;
    const song = specialSong(stats, persona);
    const artist = specialArtist(stats);
    const seen = new Set();
    const ideas = candidates(stats, persona, song, artist).filter(i => !seen.has(i.key) && seen.add(i.key)).slice(0, IDEA_COUNT);
    return { theme: theme(stats, persona), artist, song, ideas };
  }

  return { tattooIdeas, initials, roman, inkDate, GENRE_INK, HABIT_INK, IDEA_COUNT };
});
