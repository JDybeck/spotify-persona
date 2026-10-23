// Draws the results page from stats + persona. All text goes through textContent, never innerHTML.
(function (root) {
  const fmt = n => Math.round(n).toLocaleString("sv-SE");
  const pct = r => `${Math.round(r * 100)}%`;
  const pad = h => String(h).padStart(2, "0");
  const NIGHT = [22, 23, 0, 1, 2, 3];
  const genreVar = key => `var(--g-${key || "other"})`;
  const $ = id => document.getElementById(id);

  function el(tag, props = {}, kids = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "style") e.style.cssText = v;
      else if (k === "text") e.textContent = v;
      else e.setAttribute(k, v);
    }
    for (const k of [].concat(kids)) e.append(k);
    return e;
  }

  function fill(id, nodes) {
    $(id).replaceChildren(...nodes);
  }

  function hero(stats, persona) {
    const [first, second] = persona.archetype.title;
    fill("title", [`The ${first} `, el("span", { text: second })]);
    document.title = `The ${first} ${second}`;
    $("description").textContent = persona.archetype.description;
    fill("tour", [
      el("span", {}, [el("b", { text: `${stats.first.slice(0, 4)}–${stats.last.slice(0, 4)}` }), " world tour"]),
      el("span", {}, [el("b", { class: "num", text: fmt(stats.totalHours) }), " hours"]),
      el("span", {}, [el("b", { class: "num", text: fmt(stats.totalHours / 24) }), " days nonstop"]),
      el("span", {}, [el("b", { class: "num", text: fmt(stats.distinctArtists) }), " artists"]),
      el("span", {}, [el("b", { class: "num", text: fmt(stats.records) }), " streams"])
    ]);
  }

  function traits(persona) {
    fill("traits", persona.traits.map(t => el("div", { class: "trait" }, [
      el("div", { class: "trait-head" }, [el("h3", { text: t.name }), el("span", { class: "num", text: `${Math.round(t.value * 100)}/100` })]),
      el("div", { class: "meter" }, el("i", { style: `width:${pct(t.value)}` })),
      el("p", { text: t.text })
    ])));
  }

  function lineup(stats) {
    const tiers = [[0, 3, "t1"], [3, 15, "t2"], [15, 45, "t3"]];
    fill("poster", [
      ...tiers.map(([a, b, cls]) => el("div", { class: `tier ${cls}` },
        stats.topArtists.slice(a, b).map(x => el("span", { text: x.name, title: `${fmt(x.hours)} h` })))),
      el("div", { class: "dates", text: `Live in your headphones · ${stats.first} to ${stats.last}` })
    ]);
  }

  function genres(persona) {
    const { shares, taggedHours, coverage } = persona.mix;
    $("genres").hidden = shares.length === 0;
    fill("dna", shares.map(s => el("i", { style: `width:${s.share * 100}%;background:${genreVar(s.key)}`, title: s.label })));
    fill("legend", shares.map(s => el("div", {}, [
      el("span", { class: "sw", style: `background:${genreVar(s.key)}` }),
      el("span", { text: s.label }),
      el("span", { class: "num", text: pct(s.share) })
    ])));
    $("dnaNote").textContent = `Based on the ${fmt(taggedHours)} hours (${pct(coverage)} of your listening) by artists in the built-in genre list. Spotify's export has no genre data, so artists outside the list are left out.`;
  }

  const energyVar = key => (key ? `var(--e-${key})` : "var(--g-other)");

  function setlist(stats, persona) {
    const tags = persona.vibes.tags;
    fill("setlist", stats.topTracks.slice(0, 15).map(t => el("li", {}, [
      el("div", { class: "song" }, [
        el("b", { text: t.track }),
        el("span", { text: t.artist }),
        el("div", {}, (tags[`${t.track}\u0000${t.artist}`] || []).map(tag => el("span", { class: "tagchip", text: tag })))
      ]),
      el("span", { class: "plays num", text: `${fmt(t.plays)} plays` })
    ])));
  }

  function vibes(persona) {
    const { energy, vibes: list } = persona.vibes;
    $("vibesSection").hidden = list.length === 0 && energy.length === 0;
    fill("energyBar", energy.map(e => el("i", { style: `width:${e.share * 100}%;background:${energyVar(e.key)}`, title: `${e.label} ${pct(e.share)}` })));
    $("energyBar").hidden = energy.length === 0;
    $("energyNote").replaceChildren(
      el("span", { class: "energy-legend" }, energy.map(e => el("span", { style: `--sw:${energyVar(e.key)}`, text: `${e.label} ${pct(e.share)}` }))),
      energy.length ? " " : "",
      "Energy comes from each artist's genre, weighted by how often you played their songs. The vibes below come from when and how you played them."
    );
    fill("vibes", list.map(v => el("div", { class: "vibe" }, [
      el("h3", { text: v.name }),
      el("p", { text: v.blurb }),
      el("ol", {}, v.songs.map(s => el("li", {}, [
        el("span", { class: "dot", style: `background:${energyVar(s.energy)}` }),
        el("span", {}, [el("b", { text: s.track }), el("small", { text: `${s.artist} · ${s.detail}` })])
      ])))
    ])));
  }

  function skips(stats) {
    $("skips").hidden = !stats.hasBehaviorData;
    if (!stats.hasBehaviorData) return;
    const top = new Set(stats.topTracks.map(t => `${t.track}\u0000${t.artist}`));
    const loveHate = stats.skippedTracks.filter(t => top.has(`${t.track}\u0000${t.artist}`)).length;
    $("skipNote").textContent = `A skip is any track you jumped past before it ended.` +
      (loveHate ? ` ${loveHate} of your most skipped songs are also in your top 50 most played. You love them, just not right now.` : "");
    fill("skipSongs", stats.skippedTracks.slice(0, 10).map(t => {
      const title = el("b", { text: t.track });
      if (top.has(`${t.track}\u0000${t.artist}`)) title.append(el("span", { class: "chip", text: "love-hate" }));
      return el("li", {}, [
        el("div", { class: "who" }, [title, el("span", { text: t.artist })]),
        el("span", { class: "stat num" }, [el("b", { text: `${fmt(t.skips)} skips` }), el("br"), `${pct(t.rate)} of ${fmt(t.starts)}`])
      ]);
    }));
    $("skipArtistsBlock").hidden = stats.skippedArtists.length === 0;
    fill("skipArtists", stats.skippedArtists.slice(0, 10).map(a => el("li", {}, [
      el("div", { class: "who" }, [el("b", { text: a.name })]),
      el("span", { class: "stat num" }, [el("b", { text: pct(a.rate) }), ` of ${fmt(a.starts)}`]),
      el("div", { class: "meter" }, el("i", { style: `width:${pct(a.rate)}` }))
    ])));
  }

  function tour(stats, persona) {
    const eraOf = year => persona.eras.find(e => year >= e.from && year <= e.to);
    const max = Math.max(...stats.years.map(y => y.hours));
    const columns = `repeat(${stats.years.length}, minmax(0, 1fr))`;
    $("years").style.gridTemplateColumns = $("yearsAxis").style.gridTemplateColumns = columns;
    fill("years", stats.years.map(y => el("div", { class: "col", title: `${y.year}: ${fmt(y.hours)} h, #1 ${y.topArtists[0] ? y.topArtists[0].name : ""}` },
      el("div", { class: "bar", style: `height:${Math.max(2, y.hours / max * 100)}%;background:${genreVar(eraOf(y.year).genre)}` }))));
    fill("yearsAxis", stats.years.map(y => el("span", { text: `'${String(y.year).slice(2)}` })));
    fill("eras", persona.eras.map(e => el("div", { class: "era", style: `border-color:${genreVar(e.genre)}` }, [
      el("span", { class: "when", text: e.from === e.to ? `${e.from}` : `${e.from}–${e.to}` }),
      el("h3", { text: e.name }),
      el("p", { text: e.text })
    ])));
  }

  function life(persona) {
    const story = persona.life;
    if (!story) {
      $("lifeNote").textContent = "Add your birth month and year to split your history into life stages: your teenage soundtrack, your twenties, and so on. It is only saved in this browser.";
      fill("stages", []);
      return;
    }
    const still = story.stillListening;
    let stillText = "";
    if (still && still.count === 0) stillText = ` None of your current top ${still.of} artists were on repeat in your ${still.stage.toLowerCase()}. Complete reinvention.`;
    else if (still) stillText = ` ${still.count} of your current top ${still.of} artists were already on repeat in your ${still.stage.toLowerCase()}: ${still.names.join(", ")}.`;
    $("lifeNote").textContent = `You were ${story.firstAge} when you first pressed play on Spotify.${stillText}`;
    fill("stages", story.stages.map(s => el("div", { class: "stage", style: `border-top-color:${genreVar(s.genre)}` }, [
      el("span", { class: "when num", text: `Age ${s.fromAge === s.toAge ? s.fromAge : `${s.fromAge}–${s.toAge}`} · ${s.from === s.to ? s.from : `${s.from}–${s.to}`} · ${fmt(s.hours)} h` }),
      el("h3", { text: s.name }),
      el("p", {}, [el("b", { text: "Headliners: " }), s.top.join(", ")]),
      s.song ? el("p", {}, [el("b", { text: "Your song: " }), `"${s.song.track}" by ${s.song.artist}`]) : "",
      s.genreLabel ? el("span", { class: "genre", style: `color:${genreVar(s.genre)}`, text: s.genreLabel }) : ""
    ])));
  }

  const countryNames = (() => {
    try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; }
  })();
  // Two regional-indicator letters render as the country's flag.
  const flag = code => /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map(c => 0x1F1E6 + c.charCodeAt(0) - 65)) : "";
  const countryName = code => (countryNames && countryNames.of(code)) || code;
  const countryLine = countries => countries.map(c => `${flag(c.code)} ${countryName(c.code)} ${pct(c.share)}`).join(" · ");
  const range = (a, b) => (a === b ? `${a}` : `${a}–${b}`);

  function chapters(persona, onRemove) {
    fill("chapters", persona.chapters.map((c, i) => {
      const meta = [range(c.from, c.to)];
      if (c.fromAge !== undefined) meta.push(`age ${range(c.fromAge, c.toAge)}`);
      if (!c.empty) meta.push(`${fmt(c.hours)} h`);
      const remove = el("button", { type: "button", class: "remove", text: "Remove", "aria-label": `Remove ${c.label}` });
      remove.addEventListener("click", () => onRemove(i));
      return el("div", { class: `stage${c.empty ? " empty" : ""}`, style: `border-top-color:${genreVar(c.genre)}` }, [
        el("div", { class: "head" }, [el("span", { class: "kind", text: c.kindName }), remove]),
        el("h3", { text: c.label }),
        el("span", { class: "when num", text: meta.join(" · ") }),
        ...(c.empty ? [el("p", { text: "No streaming history from these years." })] : [
          el("p", {}, [el("b", { text: "Headliners: " }), c.top.join(", ")]),
          c.song ? el("p", {}, [el("b", { text: "Your song: " }), `"${c.song.track}" by ${c.song.artist}`]) : "",
          c.countries.length ? el("p", {}, [el("b", { text: "Streaming from: " }), countryLine(c.countries)]) : "",
          c.genreLabel ? el("span", { class: "genre", style: `color:${genreVar(c.genre)}`, text: c.genreLabel }) : ""
        ])
      ]);
    }));
  }

  let selectedYear = null;

  function yearDetail(b) {
    const head = [el("b", { text: `${fmt(b.hours)} hours` }), `, about ${b.perDay.toFixed(1)} a day.`];
    if (b.change !== null) {
      head.push(" ", el("span", { class: b.change >= 0 ? "up" : "down", text: `${b.change >= 0 ? "+" : "−"}${pct(Math.abs(b.change))}` }), " vs the year before.");
    }
    if (b.age !== null && b.age >= 0) head.push(` You were ${b.age}.`);
    if (b.chapters.length) head.push(" ", el("b", { text: b.chapters.join(" · ") }));

    const tiles = [
      [fmt(b.plays), "plays"],
      [fmt(b.distinctArtists), "artists"],
      [fmt(b.newArtists), "new artists"]
    ];
    if (b.skipRate !== null) tiles.push([pct(b.skipRate), "skipped"]);

    const maxArtist = b.topArtists.length ? b.topArtists[0].hours : 1;
    const foot = [];
    if (b.mix.length) {
      foot.push(el("div", { class: "dna small", role: "img", "aria-label": "Genre mix" },
        b.mix.map(s => el("i", { style: `width:${s.share * 100}%;background:${genreVar(s.key)}`, title: `${s.label} ${pct(s.share)}` }))));
      foot.push(el("p", {}, [el("b", { text: "Sound: " }), b.mix.slice(0, 3).map(s => `${s.label} ${pct(s.share)}`).join(" · ")]));
    }
    if (b.countries.length) foot.push(el("p", {}, [el("b", { text: "Streaming from: " }), countryLine(b.countries)]));

    return [
      el("div", { class: "year-head" }, [el("span", { class: "big num", text: String(b.year) }), el("p", {}, head)]),
      el("div", { class: "tiles" }, tiles.map(([value, label]) => el("div", { class: "tile" }, [el("b", { class: "num", text: value }), el("span", { text: label })]))),
      el("div", { class: "year-cols" }, [
        el("div", {}, [el("h3", { text: "Top artists" }), el("ol", { class: "ranked" }, b.topArtists.map(a => el("li", {}, [
          el("span", { text: a.name }),
          el("span", { class: "stat num", text: `${fmt(a.hours)} h` }),
          el("div", { class: "meter" }, el("i", { style: `width:${a.hours / maxArtist * 100}%` }))
        ])))]),
        el("div", {}, [el("h3", { text: "Top songs" }), el("ol", { class: "ranked" }, b.topTracks.map(t => el("li", {}, [
          el("span", {}, [t.track, el("small", { text: t.artist })]),
          el("span", { class: "stat num", text: `${fmt(t.plays)} plays` })
        ])))])
      ]),
      foot.length ? el("div", { class: "year-foot" }, foot) : ""
    ];
  }

  function yearByYear(persona) {
    const years = persona.yearByYear;
    if (!years.some(b => b.year === selectedYear)) selectedYear = years[years.length - 1].year;
    const select = year => {
      selectedYear = year;
      for (const chip of $("yearChips").children) chip.setAttribute("aria-selected", String(Number(chip.dataset.year) === year));
      fill("yearDetail", yearDetail(years.find(b => b.year === year)));
    };
    fill("yearChips", years.map(b => {
      const chip = el("button", { type: "button", role: "tab", "data-year": String(b.year), text: String(b.year) });
      chip.addEventListener("click", () => select(b.year));
      return chip;
    }));
    $("years").querySelectorAll(".col").forEach((col, i) => col.addEventListener("click", () => {
      select(years[i].year);
      $("yearSection").scrollIntoView({ block: "start", behavior: "smooth" });
    }));
    select(selectedYear);
  }

  function clock(stats) {
    const max = Math.max(...stats.hours);
    const peak = stats.hours.indexOf(max);
    const quiet = stats.hours.indexOf(Math.min(...stats.hours));
    fill("hours", stats.hours.map((h, i) => el("i", {
      class: i === peak ? "peak" : (NIGHT.includes(i) ? "night" : ""),
      style: `height:${h / max * 100}%`, title: `${pad(i)}:00 · ${fmt(h)} h`
    })));
    fill("hoursAxis", stats.hours.map((_, i) => el("span", { text: pad(i) })));
    $("clockNote").textContent = `Peak hour is ${pad(peak)}:00 with ${fmt(max)} hours over the years. The quietest is ${pad(quiet)}:00. Purple bars are the late-night shift.`;
  }

  function receipts(persona) {
    fill("receipts", persona.receipts.map(r => el("div", { class: "receipt" }, [
      el("span", { class: "big num", text: r.big }), el("p", { text: r.text }), el("small", { text: r.small })
    ])));
  }

  function render(stats, persona, handlers = {}) {
    hero(stats, persona);
    traits(persona);
    lineup(stats);
    genres(persona);
    setlist(stats, persona);
    vibes(persona);
    skips(stats);
    tour(stats, persona);
    yearByYear(persona);
    life(persona);
    chapters(persona, handlers.onRemoveChapter || (() => {}));
    clock(stats);
    receipts(persona);
    $("foot").textContent = `Built from your Spotify streaming history, ${stats.first} to ${stats.last}. Hours are total time played, including skips. A play counts streams of 30 seconds or more. Times are in your browser's time zone. Nothing left this browser.`;
  }

  (root.SpotifyPersona = root.SpotifyPersona || {}).render = render;
})(window);
