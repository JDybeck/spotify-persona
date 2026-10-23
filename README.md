# Spotify Persona

Drop in your Spotify data export and get a gig-poster breakdown of what your listening history says about you: an archetype, your all-time festival lineup, genre mix, most played and most skipped songs, listening eras and a few embarrassing receipts.

**Everything runs in your browser.** The zip is read locally by a Web Worker, nothing is uploaded, and there is no backend.

## Use it

Live at **[jdybeck.github.io/spotify-persona](https://jdybeck.github.io/spotify-persona/)**.

1. Go to [spotify.com/account/privacy](https://www.spotify.com/account/privacy/) and scroll down to the data boxes.
2. Tick only **Extended streaming history** (top right, "Utökad streaminghistorik" in Swedish). It covers every year since you joined, including skips and shuffle. Technical log information is not needed.
3. Press **Request data** and confirm the email. Spotify says up to 30 days, but it is often faster.
4. Open the site and drop the zip from the download email in. No need to unzip it.

The basic **Account data** export also works if that is what you have, but it only covers the last year and has no skip or shuffle data, so those sections are hidden.

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
| `src/persona.js` | Archetype, traits, genre mix, eras and receipts derived from the stats |
| `src/worker.js` | Unzips with [JSZip](https://stuk.github.io/jszip/) and runs the analysis off the main thread |
| `src/render.js` | Draws the results page |
| `src/app.js` | Upload handling and progress |

The logic files have no DOM access and are covered by tests:

```bash
npm test
```

### Notes on the numbers

- **Hours** are total time played, skipped streams included. A **play** is a stream of 30 seconds or more.
- A **skip** is a stream Spotify flagged as skipped, or one ended with the next button. Older extended records lack the flag, so the button counts too.
- Artists need at least 100 starts to appear in the "always skip" list.
- Times use your browser's time zone.

### Genres

Spotify's export contains no genre data, so genres come from a hand-curated dictionary in `src/genres.js`. The page shows how much of your listening it could tag, and artists outside the dictionary are left out of the genre mix. Adding artists there is the easiest way to contribute.

### The archetype

Your title combines your dominant genre with the habit that stands out most against a typical listener (loyalty, exploring, night listening, skipping, shuffling or repeating one song all day). If less than a quarter of your listening is tagged, you get "Eclectic" instead of a genre.

## License

MIT
