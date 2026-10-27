# Spotify Persona

Drop in your Spotify data export and get a gig-poster breakdown of what your listening history says about you: an archetype, your all-time festival lineup, genre mix, most played and most skipped songs, listening eras, song vibes and a few embarrassing receipts.

The **Explore** view digs into any period: the last 4 weeks, 6 or 12 months, any specific year or all time, optionally filtered to one genre. It shows streams, minutes, distinct tracks, artists and albums, top artists and songs, the genre mix and listening clocks by hour of day.

**Search** finds any artist, song or album you have played and shows its plays, hours, all-time rank, first and latest play, biggest day, plays per year and top songs or albums.

Add your birth month and year to see the soundtrack of each life stage (teenage years, early twenties and so on). Add your own chapters, like where you grew up, where you studied or the years you lived abroad, to see what you listened to then and which countries you streamed from. These details are only saved in your browser.

**Everything runs in your browser.** The zip is read locally by a Web Worker, nothing is uploaded, and there is no backend.

## Use it

Live at **[jdybeck.github.io/spotify-persona](https://jdybeck.github.io/spotify-persona/)**.

1. Go to [spotify.com/account/privacy](https://www.spotify.com/account/privacy/) and scroll down to the data boxes.
2. Tick only **Extended streaming history** (top right, "Utökad streaminghistorik" in Swedish). It covers every year since you joined, including skips and shuffle. Technical log information is not needed.
3. Press **Request data** and confirm the email. Spotify says up to 30 days, but it is often faster.
4. Open the site and drop the zip from the download email in. No need to unzip it.

The basic **Account data** export also works if that is what you have, but it only covers the last year and has no skip or shuffle data, so those sections are hidden.

## Privacy

- **Nothing is uploaded.** There is no backend. The zip is read in your browser and the results only exist in that tab. Your history itself never leaves the page.
- **Only listening history is read.** The worker opens files named `Streaming_History_Audio_*.json` or `StreamingHistory*.json` and nothing else. Every other file in the export is never decompressed or parsed.
- **Payment data is never read or stored.** This is a hard rule: payment, subscription and identity files are excluded, and a test fails if the file filter ever matches them.
- **Album covers are opt-in.** The export has no images, so "Show my album covers" asks Spotify's public oEmbed endpoint for the covers of your top 40 albums, using one track ID per album. This is the only request that ever leaves the page, it only goes to Spotify, and it only happens after you press the button. The cover URLs are cached in your browser.
- **What is stored.** Only what you choose to type in yourself (a first name for the greeting, birth date and life chapters), kept in your own browser's local storage. Personal details are never read from the export. Clearing site data removes it.

## Run locally

The page loads its scripts as separate files and uses a Web Worker, so it needs to be served over HTTP rather than opened as a file:

```bash
npx serve .
```

Any static file server works, for example `python -m http.server`.

## How it works

| File | Job |
| --- | --- |
| `src/analyze.js` | Normalizes both export formats and aggregates stats in one pass, file by file |
| `src/genres.js` | Genre definitions and the artist-to-genre dictionary |
| `src/covers.js` | Opt-in album covers for your top albums via Spotify's oEmbed endpoint |
| `src/locale.js` | Guesses the visitor's country from browser settings and shows Spotify's own data-box labels in its language(s) |
| `src/search.js` | Accent-insensitive search over artists, songs and albums, plus their detail views |
| `src/moments.js` | On this day, birthday songs, discoveries and yearly artist ranks |
| `src/explore.js` | Queries the per-hour timeline for any date range and genre |
| `src/vibes.js` | Song vibes (comfort, after dark, on repeat, phase, skip bait) from listening patterns, and energy from genre |
| `src/persona.js` | Archetype, traits, genre mix, eras and receipts derived from the stats |
| `src/worker.js` | Unzips with [JSZip](https://stuk.github.io/jszip/) and runs the analysis off the main thread |
| `src/render.js` | Draws the results page |
| `src/app.js` | Upload handling and progress |

The logic files have no DOM access and are covered by tests:

```bash
npm test
```

### Notes on the numbers

- **Hours** are total time played, skipped streams included. A **play** is a stream of 30 seconds or more. In Explore, streams and distinct counts only include plays, matching how Spotify counts them.
- A **skip** is a stream Spotify flagged as skipped, or one ended with the next button. Older extended records lack the flag, so the button counts too.
- Artists need at least 100 starts to appear in the "always skip" list.
- Times use your browser's time zone.

### Genres

Spotify's export contains no genre data, so genres come from a hand-curated dictionary in `src/genres.js`. The page shows how much of your listening it could tag, and artists outside the dictionary are left out of the genre mix. Adding artists there is the easiest way to contribute.

### Song vibes

Spotify's export has no audio analysis, and its audio-features API is closed to new apps, so vibes come from how you actually listen instead: songs you mostly play at night, songs that keep coming back across many years, songs you looped all day, one-year phases and songs you keep skipping. The energy mix (heavy, upbeat, calm and so on) comes from each artist's genre. Nothing is sent to any outside service.

### The archetype

Your title combines your dominant genre with the habit that stands out most against a typical listener (loyalty, exploring, night listening, skipping, shuffling or repeating one song all day). If less than a quarter of your listening is tagged, you get "Eclectic" instead of a genre.

## License

MIT
