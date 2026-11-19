const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("every local script and the stylesheet share one cache-busting version", () => {
  const refs = [...html.matchAll(/(?:src|href)="((?:src|css)\/[^"]+)"/g)].map(m => m[1]);
  assert.ok(refs.length > 5);
  const versions = new Set(refs.map(r => (r.match(/\?v=([^"&]+)$/) || [])[1]));
  assert.equal(versions.size, 1, `mixed versions: ${refs.join(", ")}`);
  assert.ok([...versions][0], "missing ?v=");
});

test("each tab button has at least one section", () => {
  const tabs = [...html.matchAll(/role="tab" data-tab="([a-z]+)"/g)].map(m => m[1]);
  for (const tab of tabs) assert.match(html, new RegExp(`<section data-tab="${tab}"`), tab);
});
