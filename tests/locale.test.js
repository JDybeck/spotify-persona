const test = require("node:test");
const assert = require("node:assert/strict");
const { detectCountry, labelsFor, flagOf, LABELS, COUNTRY_LANGUAGES } = require("../src/locale.js");

test("time zone wins over browser language, since it reflects where the visitor is", () => {
  assert.equal(detectCountry({ timeZone: "Europe/Stockholm", languages: ["en-US"] }), "SE");
  assert.equal(detectCountry({ timeZone: "Europe/Zurich", languages: ["sv-SE"] }), "CH");
});

test("falls back to the language region, then the language's home country", () => {
  assert.equal(detectCountry({ timeZone: "Asia/Unknown", languages: ["de-AT", "en"] }), "AT");
  assert.equal(detectCountry({ timeZone: "", languages: ["zh-Hans-CN"] }), "CN", "script subtags are skipped");
  assert.equal(detectCountry({ timeZone: "", languages: ["sv"] }), "SE");
  assert.equal(detectCountry({ timeZone: "", languages: ["nb"] }), "NO");
  assert.equal(detectCountry({}), null);
});

test("labelsFor gives Spotify's names in the country's usual languages", () => {
  assert.deepEqual(labelsFor("SE").map(l => l.extended), ["Utökad streaminghistorik"]);
  assert.equal(labelsFor("SE")[0].request, "Begär data");
  assert.deepEqual(labelsFor("CH").map(l => l.lang), ["de", "fr", "it"], "Switzerland shows all three");
  assert.deepEqual(labelsFor("FI").map(l => l.lang), ["fi", "sv"]);
  assert.deepEqual(labelsFor("BR").map(l => l.extended), ["Histórico ampliado de streams"]);
  assert.deepEqual(labelsFor("GB"), [], "English-speaking countries need no extra label");
  assert.deepEqual(labelsFor(null), []);
});

test("every mapped language has both box labels", () => {
  for (const langs of Object.values(COUNTRY_LANGUAGES)) {
    for (const lang of langs) {
      assert.ok(LABELS[lang], lang);
      assert.ok(LABELS[lang].extended && LABELS[lang].technical, lang);
    }
  }
});

test("flagOf turns a country code into regional indicator letters", () => {
  assert.equal(flagOf("SE"), "\u{1F1F8}\u{1F1EA}");
  assert.equal(flagOf("se"), "");
  assert.equal(flagOf(null), "");
});
