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

  function lineup(stats, timeline) {
    const tiers = [[0, 3, "t1"], [3, 15, "t2"], [15, 45, "t3"]];
    const artistButton = x => {
      const b = el("button", { type: "button", text: x.name, title: `${fmt(x.hours)} h · look up` });
      b.addEventListener("click", () => openDetail(timeline, "artist", timeline.artistNames.indexOf(x.name), true));
      return b;
    };
    fill("poster", [
      posterArt(stats.topArtists.slice(0, 5), timeline),
      ...tiers.map(([a, b, cls]) => el("div", { class: `tier ${cls}` }, stats.topArtists.slice(a, b).map(artistButton))),
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
      el("div", { class: "song" }, withThumb(t, [
        el("b", { text: t.track }),
        el("span", { text: t.artist }),
        el("div", {}, (tags[`${t.track}\u0000${t.artist}`] || []).map(tag => el("span", { class: "tagchip", text: tag })))
      ])),
      el("span", { class: "plays num", text: `${fmt(t.plays)} plays` })
    ])));
    fill("setlistCopy", [copyButton(() => stats.topTracks, `Copy top ${stats.topTracks.length} as playlist`)]);
  }

  const SEASON_MONTHS = { winter: [12, 1, 2], spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11] };
  /** Copy button for the most played songs in a slice of the history (years, months, genre or name pattern). */
  const sliceButton = filter => copyButton(() => SpotifyPersona.playlist.topSongs(currentTimeline, filter));

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
        el("span", {}, withThumb(s, [el("b", { text: s.track }), el("small", { text: `${s.artist} · ${s.detail}` })]))
      ]))),
      copyButton(() => v.playlist, `Copy ${v.playlist.length} as playlist`)
    ])));
  }

  function skips(stats) {
    $("skips").hidden = !stats.hasBehaviorData;
    if (!stats.hasBehaviorData) return;
    const top = new Set(stats.topTracks.map(t => `${t.track}\u0000${t.artist}`));
    const loveHate = stats.skippedTracks.filter(t => top.has(`${t.track}\u0000${t.artist}`)).length;
    $("skipNote").textContent = `A skip is any track you jumped past before it ended. "Skipping since" is the day of the second skip, when it became a habit.` +
      (loveHate ? ` ${loveHate} of your most skipped songs are also in your top 50 most played. You love them, just not right now.` : "");
    fill("skipSongs", stats.skippedTracks.slice(0, 10).map(t => {
      const title = el("b", { text: t.track });
      if (top.has(`${t.track}\u0000${t.artist}`)) title.append(el("span", { class: "chip", text: "love-hate" }));
      const artist = t.skippingSince ? `${t.artist} · skipping since ${prettyDate(t.skippingSince)}` : t.artist;
      return el("li", {}, [
        el("div", { class: "who" }, withThumb(t, [title, el("span", { text: artist })])),
        el("span", { class: "stat num" }, [
          el("b", { text: `${fmt(t.skips)} skips` }), el("br"),
          `${fmt(t.listens)} listened`, el("br"),
          `${pct(t.rate)} of ${fmt(t.starts)}`
        ])
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
      el("p", { text: e.text }),
      sliceButton({ years: [e.from, e.to] })
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
      s.genreLabel ? el("span", { class: "genre", style: `color:${genreVar(s.genre)}`, text: s.genreLabel }) : "",
      sliceButton({ years: [s.from, s.to] })
    ])));
  }

  const countryNames = (() => {
    try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; }
  })();
  // Two regional-indicator letters render as the country's flag.
  const flag = code => el("i", { class: "flag", text: SpotifyPersona.locale.flagOf(code) });
  const countryName = code => (countryNames && countryNames.of(code)) || code;
  /** Flag, name and share per country, as nodes to spread into a parent. */
  const countryLine = countries => countries.flatMap((c, i) => [i > 0 ? " · " : "", flag(c.code), ` ${countryName(c.code)} ${pct(c.share)}`]);
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
          sliceButton({ years: [c.from, c.to] }),
          c.countries.length ? el("p", {}, [el("b", { text: "Streaming from: " }), ...countryLine(c.countries)]) : "",
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
    if (b.countries.length) note.push(el("br"), "Streaming from ", ...countryLine(b.countries), ".");
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
      copyButton(() => SpotifyPersona.explore.query(currentTimeline, range, exploreState.genre || null, 50).topTracks, `Copy top 50 of ${range.label.toLowerCase()} as playlist`),
      el("div", { class: "year-cols" }, [
        el("div", {}, [el("h3", { text: "Top artists" }), el("ol", { class: "ranked" }, result.topArtists.map(a => el("li", {}, [
          el("span", { text: a.name }),
          el("span", { class: "stat num", text: duration(a.hours) }),
          el("div", { class: "meter" }, el("i", { style: `width:${a.hours / maxArtist * 100}%` }))
        ])))]),
        el("div", {}, [el("h3", { text: "Top songs" }), el("ol", { class: "ranked" }, result.topTracks.map(t => el("li", {}, [
          el("span", {}, withThumb(t, [t.track, el("small", { text: t.artist })])),
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

  // The timeline of the current render, for buttons that build playlists later on click.
  let currentTimeline = null;
  let toastTimer = null;

  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 7000);
  }

  function showCopyFallback(text) {
    $("copyFallbackText").value = text;
    $("copyFallback").hidden = false;
    $("copyFallbackText").focus();
    $("copyFallbackText").select();
    $("copyFallbackClose").onclick = () => { $("copyFallback").hidden = true; };
  }

  /**
   * A "Copy as playlist" button. getSongs runs on click and returns { track, artist } items; their Spotify
   * links go to the clipboard, ready to paste into a playlist in the Spotify app. Returns "" when the
   * export has no track IDs (the basic account-data export), so callers can always include it.
   */
  function copyButton(getSongs, label = "Copy as playlist") {
    if (!currentTimeline || !SpotifyPersona.playlist.available(currentTimeline)) return "";
    const timeline = currentTimeline;
    const b = el("button", { type: "button", class: "copy-pl", text: label });
    b.addEventListener("click", () => {
      const links = SpotifyPersona.playlist.linksFor(timeline, getSongs());
      if (links.length === 0) {
        toast("None of these songs have Spotify links in your export.");
        return;
      }
      const text = links.join("\n");
      const paste = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "Cmd+V" : "Ctrl+V";
      const done = () => toast(`Copied ${links.length} ${links.length === 1 ? "song" : "songs"}. In the Spotify desktop app, make a new playlist, click inside it and press ${paste}.`);
      // The clipboard call must happen inside the click itself, or browsers refuse it.
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => showCopyFallback(text));
      else showCopyFallback(text);
    });
    return b;
  }

  // Cover lookups are kept per timeline, so re-rendering (a new chapter, a name change) never refetches.
  const coverLoads = new WeakMap();

  // The page's one cover queue (wall, palette and song thumbnails), handed in by the app on every render.
  let coverQueue = null;

  // Whether covers are on for this render; song thumbnails only appear when they are.
  let coversOn = false;
  let thumbObserver = null;

  /** Fills an <img> with its track's cover once it scrolls near the screen, so lists do not fetch everything at once. */
  function observeThumb(img) {
    if (!thumbObserver) {
      thumbObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target;
          thumbObserver.unobserve(target);
          coverQueue.get(target.dataset.trackId).then(url => {
            if (url) target.src = url;
            else target.classList.add("none");
          });
        }
      }, { rootMargin: "300px" });
    }
    thumbObserver.observe(img);
  }

  /**
   * A small album cover for a song ({ track, artist }) or album ({ albumId }), or "" when covers are off
   * or the export has no Spotify ID for it.
   */
  function thumb(item, size = "") {
    if (!coversOn || !coverQueue || !currentTimeline) return "";
    const playlist = SpotifyPersona.playlist;
    const id = item.albumId !== undefined ? playlist.albumTrackId(currentTimeline, item.albumId) : playlist.idFor(currentTimeline, item.track, item.artist);
    if (!id) return el("span", { class: `thumb none ${size}`.trim() });
    const img = el("img", { class: `thumb ${size}`.trim(), alt: "", "data-track-id": id, referrerpolicy: "no-referrer", decoding: "async" });
    observeThumb(img);
    return img;
  }

  /** Puts a thumbnail in front of a song's text, or returns the text unchanged when covers are off. */
  function withThumb(item, nodes) {
    const t = thumb(item);
    return t ? [el("div", { class: "with-thumb" }, [t, el("div", { class: "with-thumb-text" }, nodes)])] : nodes;
  }

  // Flight lanes for the poster covers: height (%), size (% of poster height), resting x for reduced motion (%), seconds per pass.
  const POSTER_LANES = [[4, 34, 6, 38], [56, 30, 72, 44], [30, 26, 38, 50], [66, 24, 18, 41], [10, 22, 58, 47]];

  /**
   * The headliners' covers (each artist's most played song) drifting across behind the lineup, or ""
   * when covers are off. Each one fades in once its cover arrives, and drops out if there is none.
   */
  function posterArt(artists, timeline) {
    if (!coversOn || !coverQueue) return "";
    const playlist = SpotifyPersona.playlist;
    const covers = artists.map((a, i) => {
      const id = playlist.artistTrackId(timeline, timeline.artistNames.indexOf(a.name));
      if (!id) return null;
      const [y, size, x, dur] = POSTER_LANES[i % POSTER_LANES.length];
      // A negative delay starts each cover partway through its pass, so they are spread out from the first frame.
      const style = `--y:${y}%;--size:${size}cqh;--x:${x}%;--dur:${dur}s;--delay:${-dur * (i / artists.length)}s`;
      const img = el("img", { alt: "", referrerpolicy: "no-referrer", decoding: "async", style });
      img.addEventListener("load", () => img.classList.add("shown"));
      img.addEventListener("error", () => img.remove());
      coverQueue.get(id).then(url => (url ? (img.src = url) : img.remove()));
      return img;
    }).filter(Boolean);
    return covers.length ? el("div", { class: "poster-art", "aria-hidden": "true" }, covers) : "";
  }

  function coverRow(items, reverse) {
    const img = c => {
      const i = el("img", { src: c.url, alt: "", title: `${c.album} · ${c.artist}`, referrerpolicy: "no-referrer", decoding: "async" });
      i.addEventListener("error", () => i.remove());
      return i;
    };
    // Twice the same covers, so sliding the row by half its width lands exactly on the start again.
    return el("div", { class: `cover-row${reverse ? " reverse" : ""}`, style: `--duration:${Math.max(40, items.length * 6)}s` },
      [...items.map(img), ...items.map(img)]);
  }

  function coverWall(timeline, profile, onToggleCovers) {
    const api = SpotifyPersona.covers;
    const albums = api.pickAlbums(timeline);
    const yearAlbums = api.pickYearAlbums(timeline);
    $("coverToggle").hidden = albums.length === 0;
    $("coversButton").textContent = profile.covers ? "Hide album covers" : "Show my album covers";
    $("coversButton").onclick = onToggleCovers;
    $("colorsSection").hidden = albums.length === 0;
    if (!profile.covers || albums.length === 0) {
      $("coverWall").hidden = true;
      $("colorsNote").textContent = "Turn on album covers in the You tab to see the colors of your music.";
      fill("swatches", []);
      fill("yearColors", []);
      return;
    }

    // Top albums for the wall, plus each year's top albums for the colour of each year, looked up together.
    let load = coverLoads.get(timeline);
    if (!load) {
      $("coverNote").textContent = "Fetching covers from Spotify...";
      const seen = new Set(albums.map(a => a.trackId));
      const extra = yearAlbums.flatMap(y => y.albums).filter(a => !seen.has(a.trackId) && seen.add(a.trackId));
      load = api.loadCovers([...albums, ...extra], { queue: coverQueue });
      coverLoads.set(timeline, load);
    }
    load.then(found => {
      const urlById = new Map(found.map(c => [c.trackId, c.url]));
      const covers = albums.filter(a => urlById.has(a.trackId)).map(a => ({ ...a, url: urlById.get(a.trackId) }));
      const yearCovers = yearAlbums.map(y => ({
        year: y.year,
        albums: y.albums.filter(a => urlById.has(a.trackId)).map(a => ({ ...a, url: urlById.get(a.trackId) }))
      })).filter(y => y.albums.length);
      $("coverNote").textContent = covers.length
        ? `Covers of your ${covers.length} most played albums, from Spotify. Everything else stays in your browser.`
        : "Spotify didn't return any covers. Try again later.";
      if (!profile.covers || covers.length === 0) return;
      colorsSection(covers, yearCovers);
      // One row looks thin with few covers, so split into two rows only when there are enough.
      const rows = covers.length >= 12
        ? [coverRow(covers.filter((_, i) => i % 2 === 0), false), coverRow(covers.filter((_, i) => i % 2 === 1), true)]
        : [coverRow(covers, false)];
      fill("coverWall", rows);
      $("coverWall").hidden = false;
    });
  }

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
        return el("li", {}, [el("span", { class: "when num", text: when.join(" · ") }), ...day.topTracks.flatMap(t => withThumb(t, songLine(t)))]);
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
      ...withThumb(day.topTracks[0], songLine(day.topTracks[0]))
    ])) : [el("li", { class: "empty-note", text: "No music on your birthdays yet. Time to fix that." })]);
    fill("birthdaysCopy", days.length ? [copyButton(() => days.map(d => d.topTracks[0]), "Copy birthday playlist")] : []);
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

  const KIND_LABEL = { artist: "Artist", track: "Song", album: "Album" };

  /** A clickable result row; `item` ({ track, artist } or { albumId }) adds a cover thumbnail when covers are on. */
  function pickButton(main, sub, onClick, item = null) {
    const text = [el("b", { text: main }), sub ? el("small", { text: sub }) : ""];
    const b = el("button", { type: "button", class: "pick" }, item ? withThumb(item, text) : text);
    b.addEventListener("click", onClick);
    return b;
  }

  function openDetail(timeline, kind, id, scroll = false) {
    const d = id >= 0 ? SpotifyPersona.search.detail(timeline, kind, id) : null;
    const panel = $("searchDetail");
    panel.hidden = !d;
    if (!d) return;
    const plural = n => `${fmt(n)} ${n === 1 ? "play" : "plays"}`;
    const kindWord = { artist: "artists", track: "songs", album: "albums" }[kind];
    const tiles = [
      [fmt(d.plays), "plays"],
      [duration(d.hours), "listened"],
      [`#${fmt(d.rank)}`, `of your ${kindWord}`],
      [prettyDate(d.first), "first play"],
      [prettyDate(d.last), "latest play"],
      [plural(d.peakDay.plays), `on ${prettyDate(d.peakDay.date)}, the biggest day`]
    ];
    const max = Math.max(...d.perYear.map(y => y.plays), 1);
    const columns = `repeat(${d.perYear.length}, minmax(0, 1fr))`;
    const lists = [];
    if (d.topTracks.length) {
      lists.push(el("div", {}, [el("h3", { text: kind === "album" ? "Songs you played" : "Top songs" }),
        el("ol", { class: "ranked" }, d.topTracks.map(t => el("li", {}, [
          pickButton(t.track, null, () => openDetail(timeline, "track", t.id), { track: t.track, artist: kind === "artist" ? d.name : d.by }),
          el("span", { class: "stat num", text: plural(t.plays) })
        ])))]));
    }
    if (d.topAlbums.length) {
      lists.push(el("div", {}, [el("h3", { text: "Top albums" }),
        el("ol", { class: "ranked" }, d.topAlbums.map(a => el("li", {}, [
          pickButton(a.album, null, () => openDetail(timeline, "album", a.id), { albumId: a.id }),
          el("span", { class: "stat num", text: plural(a.plays) })
        ])))]));
    }

    const cover = kind === "track" ? thumb({ track: d.name, artist: d.by }, "big") : kind === "album" ? thumb({ albumId: id }, "big") : "";
    const header = [cover, el("span", { class: "detail-kind", text: d.by ? `${KIND_LABEL[kind]} by ${d.by}` : KIND_LABEL[kind] }), el("span", { class: "detail-name", text: d.name })];
    if (d.by) {
      const byId = timeline.artistNames.indexOf(d.by);
      header.push(pickButton(`More from ${d.by}`, null, () => openDetail(timeline, "artist", byId)));
    }
    if (kind === "artist") {
      header.push(pickButton(`Hide ${d.name} from my stats`, "Leaves them out everywhere, like baby music on your account. Undo from the bar at the top.", () => {
        $("searchDetail").hidden = true;
        onHideArtist(d.name);
      }));
    }
    fill("searchDetail", [
      el("div", { class: "detail-head" }, header),
      el("div", { class: "tiles" }, tiles.map(([value, text]) => el("div", { class: "tile" }, [el("b", { class: "num", text: value }), el("span", { text })]))),
      el("div", {}, [
        el("h3", { class: "clocks-title", text: "Plays per year" }),
        el("div", { class: "detail-years", style: `grid-template-columns:${columns}`, role: "img", "aria-label": "Plays per year" },
          d.perYear.map(y => el("i", { style: `height:${y.plays / max * 100}%`, title: `${y.year}: ${plural(y.plays)}` }))),
        el("div", { class: "detail-years-axis", style: `grid-template-columns:${columns}` },
          d.perYear.map((y, i) => el("span", { text: d.perYear.length > 10 && i % 2 ? "" : `'${String(y.year).slice(2)}` })))
      ]),
      lists.length ? el("div", { class: "year-cols" }, lists) : ""
    ]);
    if (scroll) {
      SpotifyPersona.showTab($("searchSection").dataset.tab, { scroll: false });
      $("searchSection").scrollIntoView({ block: "start", behavior: "smooth" });
    }
    else panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function searchSection(timeline) {
    const input = $("searchInput");
    let timer = null;
    const run = () => {
      const r = SpotifyPersona.search.search(timeline, input.value);
      const groups = [["Artists", r.artists], ["Songs", r.tracks], ["Albums", r.albums]].filter(([, items]) => items.length);
      if (input.value.trim().length >= SpotifyPersona.search.MIN_QUERY && groups.length === 0) {
        fill("searchResults", [el("p", { class: "search-empty", text: `Nothing you've played matches "${input.value.trim()}".` })]);
        return;
      }
      fill("searchResults", groups.map(([title, items]) => el("div", {}, [
        el("h3", { text: title }),
        el("ol", {}, items.map(x => el("li", {}, pickButton(
          x.name,
          `${x.by ? `${x.by} · ` : ""}${fmt(x.plays)} ${x.plays === 1 ? "play" : "plays"}`,
          () => openDetail(timeline, x.kind, x.id),
          x.kind === "track" ? { track: x.name, artist: x.by } : x.kind === "album" ? { albumId: x.id } : null
        ))))
      ])));
    };
    input.oninput = () => { clearTimeout(timer); timer = setTimeout(run, 120); };
    run();
  }

  const tile = ([value, text]) => el("div", { class: "tile" }, [el("b", { class: "num", text: value }), el("span", { text })]);

  function sessionsSection(h) {
    $("sessionsSection").hidden = !h || !h.sessions;
    if (!h || !h.sessions) return;
    const { sessions: s, streaks: st } = h;
    fill("sessionTiles", [
      [`${s.longest.hours.toFixed(1)} h`, "longest session"],
      [`${fmt(st.longest.days)} days`, "longest daily streak"],
      [`${fmt(st.latest.days)} ${st.latest.days === 1 ? "day" : "days"}`, "latest streak"],
      [fmt(st.activeDays), "days with music"],
      [fmt(s.longSessions), "sessions over 3 hours"],
      [duration(s.medianMinutes / 60), "a typical session"]
    ].map(tile));
    fill("sessionDetail", [
      el("li", {}, [
        el("span", { class: "when num", text: `${prettyDate(s.longest.date)} · from ${s.longest.startTime} · ${fmt(s.longest.streams)} songs` }),
        el("b", { text: "Your longest session" }),
        el("small", { text: `On repeat: ${s.longest.topTracks.map(t => `"${t.track}" (${t.plays}×)`).join(", ")}. A session ends after 10 minutes of silence.` })
      ]),
      el("li", {}, [
        el("span", { class: "when num", text: `${prettyDate(st.longest.from)} to ${prettyDate(st.longest.to)}` }),
        el("b", { text: `${fmt(st.longest.days)} days in a row` }),
        el("small", { text: "Your longest run of days with at least one song." })
      ])
    ]);
  }

  /** Stacked yearly columns: one segment per key, each a share of that year. */
  function stackedYears(id, rows, keys, colors) {
    const columns = `repeat(${rows.length}, minmax(0, 1fr))`;
    const chart = $(id);
    chart.style.gridTemplateColumns = columns;
    fill(id, rows.map(r => el("div", { class: "col", title: `${r.year}: ${keys.map(k => `${pct(r[k] || 0)}`).join(" / ")}` },
      keys.map(k => el("i", { style: `height:${(r[k] || 0) * 100}%;background:${colors[k]}` })))));
    let axis = chart.nextElementSibling;
    if (!axis || !axis.classList.contains("stack-years-axis")) {
      axis = el("div", { class: "stack-years-axis" });
      chart.after(axis);
    }
    axis.style.gridTemplateColumns = columns;
    axis.replaceChildren(...rows.map((r, i) => el("span", { text: rows.length > 10 && i % 2 ? "" : `'${String(r.year).slice(2)}` })));
  }

  const REASON_COLORS = { chose: "var(--c1)", flowed: "var(--c2)", skipped: "var(--c6)" };

  function algorithmSection(h) {
    const a = h && h.algorithm;
    $("algorithmSection").hidden = !a;
    if (!a) return;
    const share = k => a.shares.find(s => s.key === k).share;
    $("algorithmNote").textContent = `You picked ${pct(share("chose"))} of your songs yourself. ${pct(share("flowed"))} just kept playing from a queue, album, playlist or autoplay, and ${pct(share("skipped"))} you reached by skipping. Columns show each year.`;
    fill("algorithmBar", a.shares.map(s => el("i", { style: `width:${s.share * 100}%;background:${REASON_COLORS[s.key]}`, title: `${s.label} ${pct(s.share)}` })));
    fill("algorithmLegend", a.shares.map(s => el("div", {}, [
      el("span", { class: "sw", style: `background:${REASON_COLORS[s.key]}` }), el("span", { text: s.label }), el("span", { class: "num", text: pct(s.share) })
    ])));
    stackedYears("algorithmYears", a.byYear, ["chose", "flowed", "skipped"], REASON_COLORS);
  }

  const DEVICE_COLORS = { android: "var(--c5)", iphone: "var(--c2)", windows: "var(--c3)", mac: "var(--c4)", linux: "var(--c1)", web: "var(--c6)", living: "var(--g-rock)", other: "var(--g-other)" };

  function devicesSection(h, stats) {
    const d = h && h.devices;
    $("devicesSection").hidden = !d;
    if (!d) return;
    fill("deviceBar", d.shares.map(s => el("i", { style: `width:${s.share * 100}%;background:${DEVICE_COLORS[s.key]}`, title: `${s.label} ${pct(s.share)}` })));
    fill("deviceLegend", d.shares.filter(s => s.share >= 0.01).map(s => el("div", {}, [
      el("span", { class: "sw", style: `background:${DEVICE_COLORS[s.key]}` }), el("span", { text: s.label }), el("span", { class: "num", text: pct(s.share) })
    ])));
    const first = stats.years[0].year, span = stats.years[stats.years.length - 1].year - first + 1;
    fill("deviceHistory", d.history.slice(0, 12).map(x => el("li", {}, [
      el("b", { text: x.name }),
      el("div", { class: "span" }, el("i", { style: `left:${(x.first - first) / span * 100}%;width:${(x.last - x.first + 1) / span * 100}%;background:${DEVICE_COLORS[x.category]}` })),
      el("small", { class: "num", text: `${range(x.first, x.last)} · ${duration(x.hours)}` })
    ])));
  }

  function comebacksSection(h) {
    const list = (h && h.comebacks) || [];
    $("comebacksSection").hidden = list.length === 0;
    fill("comebacks", list.map(c => el("li", {}, [
      el("span", { class: "when num", text: `Back in ${c.backYear} after ${c.silentYears} silent years` }),
      ...withThumb(c, [
        el("b", { text: `"${c.track}"` }),
        el("small", { text: `${c.artist} · ${fmt(c.playsBefore)} plays until ${c.lastYear}, ${fmt(c.playsAfter)} since` })
      ])
    ])));
    fill("comebacksCopy", list.length ? [copyButton(() => list, "Copy comebacks playlist")] : []);
  }

  const SEASON_STYLE = { winter: ["Winter", "var(--c2)"], spring: ["Spring", "var(--c5)"], summer: ["Summer", "var(--c3)"], autumn: ["Autumn", "var(--c1)"] };

  function seasonsSection(h) {
    const s = h && h.seasons;
    $("seasonsSection").hidden = !s;
    if (!s) return;
    fill("seasonGrid", Object.entries(SEASON_STYLE).map(([key, [label, color]]) => el("div", { class: "season", style: `--season:${color}` }, [
      el("h3", { text: label }),
      el("ol", {}, s.top[key].map(a => el("li", { text: a.name }))),
      sliceButton({ months: SEASON_MONTHS[key] })
    ])));
    $("seasonalNote").textContent = s.seasonal.length
      ? `Most seasonal: ${s.seasonal.slice(0, 4).map(a => `${a.name} (${pct(a.share)} ${a.season})`).join(", ")}.`
      : "Your taste barely changes with the seasons.";

    const c = h.christmas;
    $("christmasBlock").hidden = !c;
    if (!c) return;
    const starts = c.byYear.map(y => y.first).filter(Boolean).sort();
    const typical = starts.length ? starts[Math.floor(starts.length / 2)] : null;
    const typicalText = typical ? ` Your Christmas season usually starts around ${Number(typical.slice(3))} ${MONTHS[Number(typical.slice(0, 2)) - 1]}.` : "";
    const topText = c.topSongs.length ? ` Favourite: "${c.topSongs[0].track}" by ${c.topSongs[0].artist}.` : "";
    $("christmasNote").textContent = `${fmt(c.total)} plays of Christmas songs.${typicalText}${topText}`;
    fill("christmasCopy", [sliceButton({ match: SpotifyPersona.habits.CHRISTMAS })]);
    fill("christmasYears", [...c.byYear].reverse().map(y => el("li", {}, [
      el("span", { class: "when num", text: `${y.year} · ${fmt(y.plays)} ${y.plays === 1 ? "play" : "plays"}` }),
      el("b", { text: y.first ? `First on ${Number(y.first.slice(3))} ${MONTHS[Number(y.first.slice(0, 2)) - 1]}` : "Only out of season" }),
      y.outOfSeason ? el("small", { text: `${y.outOfSeason} before September. Bold.` }) : ""
    ])));
  }

  function newYearSection(h) {
    const list = (h && h.newYear) || [];
    $("newYearSection").hidden = list.length === 0;
    fill("newYear", [...list].reverse().map(n => el("li", {}, [
      el("span", { class: "when num", text: `${prettyDate(n.date)} · ${n.time}` }),
      ...withThumb(n, [el("b", { text: `"${n.track}"` }), el("small", { text: n.artist })])
    ])));
    fill("newYearCopy", list.length ? [copyButton(() => list, "Copy New Year playlist")] : []);
  }

  // Dominant colours per image URL, so re-renders do not sample the same cover again.
  const colorCache = new Map();
  const hex = rgb => `#${rgb.map(v => v.toString(16).padStart(2, "0")).join("")}`;

  function sampleColor(url) {
    if (!colorCache.has(url)) {
      colorCache.set(url, new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.referrerPolicy = "no-referrer";
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = canvas.height = 32;
            const ctx = canvas.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, 32, 32);
            resolve(SpotifyPersona.covers.dominantColor(ctx.getImageData(0, 0, 32, 32).data));
          } catch { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = url;
      }));
    }
    return colorCache.get(url);
  }

  /**
   * Tints the page's background glows with the three most vivid of the given colours,
   * or puts the default accent glows back when given nothing.
   */
  function setGlow(colors) {
    const root = document.documentElement.style;
    const vivid = (colors || []).filter(c => SpotifyPersona.covers.vividness(c) >= 0.25)
      .sort((a, b) => SpotifyPersona.covers.vividness(b) - SpotifyPersona.covers.vividness(a));
    ["--glow-1", "--glow-2", "--glow-3"].forEach((name, i) => {
      if (vivid[i]) root.setProperty(name, hex(vivid[i]));
      else root.removeProperty(name);
    });
  }

  async function colorsSection(topCovers, yearCovers) {
    const api = SpotifyPersona.covers;
    const top = (await Promise.all(topCovers.slice(0, 12).map(async c => ({ ...c, rgb: await sampleColor(c.url) })))).filter(c => c.rgb);
    setGlow(top.map(c => c.rgb));
    // A year's colour is the most vivid of its top albums' colours; its tile shows the #1 album's cover.
    const byYear = await Promise.all(yearCovers.map(async y => {
      const colors = await Promise.all(y.albums.map(a => sampleColor(a.url)));
      const rgb = api.yearColor(colors);
      const source = y.albums[colors.indexOf(rgb)] || y.albums[0];
      return { year: y.year, rgb, cover: y.albums[0], source };
    }));
    $("colorsNote").textContent = "The strongest color on each of your most played covers.";
    fill("swatches", top.map(c => el("div", { class: "swatch", title: `${c.album} · ${c.artist}` }, [
      el("div", { class: "chips" }, [el("img", { src: c.url, alt: "", referrerpolicy: "no-referrer" }), el("i", { style: `background:${hex(c.rgb)}` })]),
      el("small", {}, [el("code", { text: hex(c.rgb) }), el("br"), c.album])
    ])));
    const years = byYear.filter(y => y.rgb);
    fill("yearColors", years.map(y => el("div", { class: "year-tile", title: `${y.year}: ${y.cover.album} · ${y.cover.artist}${y.source !== y.cover ? ` (color from ${y.source.album})` : ""}` }, [
      el("img", { src: y.cover.url, alt: "", referrerpolicy: "no-referrer" }),
      el("i", { style: `background:${hex(y.rgb)}` }),
      el("span", { class: "num", text: String(y.year) })
    ])));
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

  // Set on every render, so detail views opened later call the current handler.
  let onHideArtist = () => {};

  function render({ stats, persona, timeline, profile, coverQueue: queue, onRemoveChapter = () => {}, onToggleCovers = () => {}, onHideArtist: hideHandler = () => {} }) {
    onHideArtist = hideHandler;
    currentTimeline = timeline;
    coverQueue = queue;
    coversOn = profile.covers && SpotifyPersona.playlist.available(timeline);
    if (!coversOn) setGlow(null);
    greeting(profile);
    hero(stats, persona);
    coverWall(timeline, profile, onToggleCovers);
    traits(persona);
    lineup(stats, timeline);
    genres(persona);
    setlist(stats, persona);
    vibes(persona);
    skips(stats);
    tour(stats, persona);
    discovery(stats, timeline);
    explore(stats, persona, timeline);
    searchSection(timeline);
    onThisDay(timeline, profile.birth);
    life(persona);
    birthdays(timeline, profile.birth);
    chapters(persona, onRemoveChapter);
    clock(stats);
    receipts(persona);
    sessionsSection(stats.habits);
    algorithmSection(stats.habits);
    devicesSection(stats.habits, stats);
    comebacksSection(stats.habits);
    seasonsSection(stats.habits);
    newYearSection(stats.habits);
    $("foot").textContent = `Built from your Spotify streaming history, ${stats.first} to ${stats.last}. Hours are total time played, including skips. A play counts streams of 30 seconds or more. Times are in your browser's time zone. Nothing left this browser.`;
  }

  (root.SpotifyPersona = root.SpotifyPersona || {}).render = render;
})(window);
