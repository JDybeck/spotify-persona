// Draws the results page from stats + persona. All text goes through textContent, never innerHTML.
(function (root) {
  const fmt = n => Math.round(n).toLocaleString("sv-SE");
  const pct = r => `${Math.round(r * 100)}%`;
  const pad = h => String(h).padStart(2, "0");
  const duration = h => (h < 1 ? `${Math.round(h * 60)} min` : `${fmt(h)} h`);
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

  // Explore view state survives re-renders (adding a chapter should not reset the chosen range).
  const exploreState = { range: "12m", genre: "" };
  const SVG_NS = "http://www.w3.org/2000/svg";

  function svg(tag, attrs = {}, kids = []) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    for (const k of [].concat(kids)) e.append(k);
    return e;
  }

  /** A 24-hour radial chart: midnight at the top, running clockwise, wedge length proportional to the value. */
  function radialClock(values, label, unit) {
    const max = Math.max(...values, 1);
    const R = 100;
    // Degrees clockwise from 12 o'clock to an [x, y] point.
    const point = (deg, r) => {
      const rad = (deg - 90) * Math.PI / 180;
      return [(Math.cos(rad) * r).toFixed(2), (Math.sin(rad) * r).toFixed(2)];
    };
    const spokes = values.map((_, h) => {
      const [x2, y2] = point(h * 15, R + 8);
      return svg("line", { x1: 0, y1: 0, x2, y2, class: "spoke" });
    });
    const wedges = values.map((v, h) => {
      const r = v / max * R;
      if (r <= 0) return "";
      const wedge = svg("path", {
        d: `M0,0 L${point(h * 15 + 1, r).join(",")} A${r},${r} 0 0 1 ${point(h * 15 + 14, r).join(",")} Z`,
        class: NIGHT.includes(h) ? "wedge night" : "wedge"
      });
      wedge.append(svg("title", {}, `${pad(h)}:00 · ${fmt(v)} ${unit}`));
      return wedge;
    });
    const labels = [0, 6, 12, 18].map(h => {
      const [x, y] = point(h * 15, R + 20);
      return svg("text", { x, y, class: "clock-label", "text-anchor": "middle", "dominant-baseline": "middle" }, pad(h));
    });
    return el("figure", { class: "clock" }, [
      svg("svg", { viewBox: "-135 -135 270 270", role: "img", "aria-label": `${label} by hour of day` }, [...spokes, ...wedges, ...labels]),
      el("figcaption", { text: label })
    ]);
  }

  function rangeNote(range, persona) {
    if (!range.year) return [range.key === "all" ? "Everything since your first stream." : `Counting back from your last stream.`];
    const b = persona.yearByYear.find(y => y.year === range.year);
    const note = [];
    if (b.change !== null) note.push(el("span", { class: b.change >= 0 ? "up" : "down", text: `${b.change >= 0 ? "+" : "−"}${pct(Math.abs(b.change))}` }), " vs the year before. ");
    note.push(`About ${b.perDay.toFixed(1)} hours a day. ${fmt(b.newArtists)} new artists discovered.`);
    if (b.skipRate !== null) note.push(` ${pct(b.skipRate)} skipped.`);
    if (b.age !== null && b.age >= 0) note.push(` You were ${b.age}.`);
    if (b.chapters.length) note.push(" ", el("b", { text: b.chapters.join(" · ") }));
    if (b.countries.length) note.push(el("br"), "Streaming from ", countryLine(b.countries), ".");
    return note;
  }

  function exploreDetail(result, range, persona) {
    const head = el("div", { class: "year-head" }, [el("span", { class: "big num", text: range.label }), el("p", {}, rangeNote(range, persona))]);
    if (result.streams === 0) return [head, el("p", { class: "lede", text: "Nothing played in this range." })];

    const tiles = [
      [fmt(result.streams), "streams"],
      [fmt(result.minutes), "minutes streamed"],
      [fmt(result.hours), "hours streamed"],
      [fmt(result.tracks), "different tracks"],
      [fmt(result.artists), "different artists"]
    ];
    if (result.albums !== null) tiles.push([fmt(result.albums), "different albums"]);
    const maxArtist = result.topArtists.length ? result.topArtists[0].hours : 1;

    return [
      head,
      el("div", { class: "tiles" }, tiles.map(([value, label]) => el("div", { class: "tile" }, [el("b", { class: "num", text: value }), el("span", { text: label })]))),
      el("div", { class: "year-cols" }, [
        el("div", {}, [el("h3", { text: "Top artists" }), el("ol", { class: "ranked" }, result.topArtists.map(a => el("li", {}, [
          el("span", { text: a.name }),
          el("span", { class: "stat num", text: duration(a.hours) }),
          el("div", { class: "meter" }, el("i", { style: `width:${a.hours / maxArtist * 100}%` }))
        ])))]),
        el("div", {}, [el("h3", { text: "Top songs" }), el("ol", { class: "ranked" }, result.topTracks.map(t => el("li", {}, [
          el("span", {}, [t.track, el("small", { text: t.artist })]),
          el("span", { class: "stat num", text: `${fmt(t.plays)} plays` })
        ])))])
      ]),
      result.mix.length > 1 ? el("div", { class: "year-foot" }, [
        el("div", { class: "dna small", role: "img", "aria-label": "Genre mix" },
          result.mix.map(s => el("i", { style: `width:${s.share * 100}%;background:${genreVar(s.key)}`, title: `${s.label} ${pct(s.share)}` }))),
        el("p", {}, [el("b", { text: "Sound: " }), result.mix.filter(s => s.share >= 0.01).slice(0, 4).map(s => `${s.label} ${pct(s.share)}`).join(" · ")])
      ]) : "",
      el("div", {}, [
        el("h3", { class: "clocks-title", text: "Listening clocks" }),
        el("div", { class: "clocks" }, [radialClock(result.clock.streams, "streams", "streams"), radialClock(result.clock.minutes, "minutes streamed", "min")])
      ])
    ];
  }

  function explore(stats, persona, timeline) {
    const api = SpotifyPersona.explore;
    const ranges = api.ranges(stats);
    if (!ranges.some(r => r.key === exploreState.range)) exploreState.range = "12m";

    const genreSelect = $("genreFilter");
    genreSelect.replaceChildren(el("option", { value: "", text: "All genres" }),
      ...api.availableGenres(timeline).map(g => el("option", { value: g.key, text: g.label })));
    if (![...genreSelect.options].some(o => o.value === exploreState.genre)) exploreState.genre = "";
    genreSelect.value = exploreState.genre;

    const update = () => {
      const range = ranges.find(r => r.key === exploreState.range);
      for (const chip of $("rangeChips").children) chip.setAttribute("aria-selected", String(chip.dataset.range === range.key));
      fill("exploreDetail", exploreDetail(api.query(timeline, range, exploreState.genre || null), range, persona));
    };

    fill("rangeChips", ranges.map(r => {
      const chip = el("button", { type: "button", role: "tab", "data-range": r.key, text: r.label });
      chip.addEventListener("click", () => { exploreState.range = r.key; update(); });
      return chip;
    }));
    genreSelect.onchange = () => { exploreState.genre = genreSelect.value; update(); };
    $("years").querySelectorAll(".col").forEach((col, i) => col.addEventListener("click", () => {
      exploreState.range = `y${stats.years[i].year}`;
      update();
      $("explore").scrollIntoView({ block: "start", behavior: "smooth" });
    }));
    update();
  }

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const prettyDate = isoDate => {
    const [y, m, d] = isoDate.split("-").map(Number);
    return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`;
  };
  const songLine = t => [el("b", { text: `"${t.track}"` }), el("small", { text: `${t.artist} · ${fmt(t.plays)} ${t.plays === 1 ? "play" : "plays"}` })];

  function greeting(profile) {
    $("greeting").textContent = profile.name ? `Hey ${profile.name}, this is your Spotify personality` : "Your Spotify personality";
  }

  // Remembered across re-renders, so adding a chapter does not reset a date the user picked.
  let otdDate = null;

  function onThisDay(timeline, birth) {
    const input = $("otdDate");
    if (!otdDate) {
      const now = new Date();
      otdDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    }
    input.value = otdDate;
    const update = () => {
      if (!input.value) return;
      otdDate = input.value;
      const [, m, d] = otdDate.split("-").map(Number);
      $("otdTitle").textContent = `${d} ${MONTHS[m - 1]} through the years`;
      const days = SpotifyPersona.moments.onThisDay(timeline, m, d);
      if (days.length === 0) {
        fill("otdList", [el("li", { class: "empty-note", text: "Nothing played on this date in any year. Try another one." })]);
        return;
      }
      fill("otdList", days.map(day => {
        const age = birth ? day.year - birth.year - (m < birth.month || (m === birth.month && d < (birth.day || 1)) ? 1 : 0) : null;
        const when = [String(day.year)];
        if (age !== null && age >= 0) when.push(`age ${age}`);
        when.push(duration(day.minutes / 60));
        return el("li", {}, [el("span", { class: "when num", text: when.join(" · ") }), ...day.topTracks.flatMap(songLine)]);
      }));
    };
    input.onchange = update;
    update();
  }

  function birthdays(timeline, birth) {
    $("birthdayBlock").hidden = !(birth && birth.day);
    if (!birth || !birth.day) return;
    const days = SpotifyPersona.moments.onThisDay(timeline, birth.month, birth.day, 1);
    fill("birthdays", days.length ? days.map(day => el("li", {}, [
      el("span", { class: "when num", text: `Turning ${day.year - birth.year} · ${day.year} · ${duration(day.minutes / 60)}` }),
      ...songLine(day.topTracks[0])
    ])) : [el("li", { class: "empty-note", text: "No music on your birthdays yet. Time to fix that." })]);
  }

  /** Bump chart of yearly ranks: rank 1 at the top, lines broken where an artist dropped out of the top 15. */
  function bumpChart(ranks) {
    const MAX_RANK = 15, COL = 56, ROW = 22, LEFT = 34, TOP = 18;
    const width = LEFT + Math.max(ranks.years.length - 1, 1) * COL + 24;
    const height = TOP + (MAX_RANK - 1) * ROW + 34;
    const x = i => LEFT + i * COL;
    const y = r => TOP + (r - 1) * ROW;
    const grid = [1, 5, 10, 15].flatMap(r => [
      svg("line", { x1: LEFT - 6, x2: width - 12, y1: y(r), y2: y(r), class: "gridline" }),
      svg("text", { x: LEFT - 12, y: y(r), class: "axis", "text-anchor": "end", "dominant-baseline": "middle" }, `#${r}`)
    ]);
    const years = ranks.years.map((yr, i) => svg("text", { x: x(i), y: height - 8, class: "axis", "text-anchor": "middle" }, `'${String(yr).slice(2)}`));
    const series = ranks.artists.map((a, n) => {
      const color = `var(--l${n + 1})`;
      const segments = [];
      let current = [];
      a.ranks.forEach((r, i) => {
        if (r !== null && r <= MAX_RANK) current.push(`${x(i)},${y(r)}`);
        else if (current.length) { segments.push(current); current = []; }
      });
      if (current.length) segments.push(current);
      const lines = segments.filter(s => s.length > 1).map(s => svg("polyline", { points: s.join(" "), class: "line", "data-artist": String(n), style: `stroke:${color}` }));
      const dots = a.ranks.map((r, i) => (r !== null && r <= MAX_RANK)
        ? svg("circle", { cx: x(i), cy: y(r), r: 4.5, class: "dot", "data-artist": String(n), style: `fill:${color}` }, svg("title", {}, `${a.name}: #${r} in ${ranks.years[i]}`))
        : "");
      return [...lines, ...dots];
    });
    return svg("svg", { class: "bump", viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Yearly artist ranks" }, [...grid, ...years, ...series.flat()]);
  }

  function discovery(stats, timeline) {
    const api = SpotifyPersona.moments;
    const ranks = api.artistRanks(timeline, 10);
    const chart = bumpChart(ranks);
    fill("bump", [chart]);
    let focused = null;
    const focus = n => {
      focused = focused === n ? null : n;
      chart.classList.toggle("focus", focused !== null);
      chart.querySelectorAll("[data-artist]").forEach(e => e.classList.toggle("on", Number(e.dataset.artist) === focused));
      for (const b of $("bumpLegend").children) b.setAttribute("aria-pressed", String(Number(b.dataset.artist) === focused));
    };
    fill("bumpLegend", ranks.artists.map((a, n) => {
      const b = el("button", { type: "button", "data-artist": String(n), "aria-pressed": "false", style: `--sw:var(--l${n + 1})`, text: a.name });
      b.addEventListener("click", () => focus(n));
      b.addEventListener("mouseenter", () => { if (focused === null) { chart.classList.add("focus"); chart.querySelectorAll(`[data-artist="${n}"]`).forEach(e => e.classList.add("on")); } });
      b.addEventListener("mouseleave", () => { if (focused === null) { chart.classList.remove("focus"); chart.querySelectorAll(".on").forEach(e => e.classList.remove("on")); } });
      return b;
    }));

    const found = api.discoveries(timeline, stats.topArtists.slice(0, 12).map(a => a.name));
    fill("discoveries", found.map(d => {
      let clicked = "Never quite clicked.";
      if (d.monthsToClick === 0) clicked = "Clicked straight away.";
      else if (d.monthsToClick !== null) {
        const [cy, cm] = d.clicked.split("-").map(Number);
        clicked = `Clicked in ${MONTHS[cm - 1]} ${cy}, ${d.monthsToClick} ${d.monthsToClick === 1 ? "month" : "months"} later.`;
      }
      return el("li", {}, [
        el("span", { class: "when num", text: prettyDate(d.first) }),
        el("b", { text: d.name }),
        el("small", { text: `First song: "${d.firstTrack}". ${clicked}` })
      ]);
    }));
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

  function render({ stats, persona, timeline, profile, onRemoveChapter = () => {} }) {
    greeting(profile);
    hero(stats, persona);
    traits(persona);
    lineup(stats);
    genres(persona);
    setlist(stats, persona);
    vibes(persona);
    skips(stats);
    tour(stats, persona);
    discovery(stats, timeline);
    explore(stats, persona, timeline);
    onThisDay(timeline, profile.birth);
    life(persona);
    birthdays(timeline, profile.birth);
    chapters(persona, onRemoveChapter);
    clock(stats);
    receipts(persona);
    $("foot").textContent = `Built from your Spotify streaming history, ${stats.first} to ${stats.last}. Hours are total time played, including skips. A play counts streams of 30 seconds or more. Times are in your browser's time zone. Nothing left this browser.`;
  }

  (root.SpotifyPersona = root.SpotifyPersona || {}).render = render;
})(window);
