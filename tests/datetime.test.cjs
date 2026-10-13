const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const c = vm.createContext({ console, URL, window: { location: { href: "https://fixture.test/app/", pathname: "/app/" } } });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../app/app.js"), "utf8"), c);

test("deutsche Uhrzeit mit Zusatz „Uhr“ bleibt lesbar", () => {
  const r = c.normalizeDateTime("01.02.2026", "10:00 Uhr");
  assert.ok(r);
  assert.equal(r.timeLabel, "10:00");
  assert.equal(r.dateLabel, "01.02.2026");
});

test("deutsches Kurzdatum wird als Tag.Monat gelesen", () => {
  assert.equal(c.normalizeDateTime("1.2.2026", "").dateLabel, "01.02.2026");
  assert.equal(c.normalizeDateTime("31.2.2026", ""), null);
});

test("Meldung ohne Uhrzeit zeigt keinen hängenden Trenner", () => {
  const item = { summary: "S", office: "Amt", dateLabel: "01.02.2026", timeLabel: "", fullText: "T", channel: "x", isOfficial: true };
  assert.equal(c.formatNewsStamp(item), "01.02.2026");
  assert.equal(c.formatNewsStamp({ ...item, timeLabel: "10:00" }), "01.02.2026 · 10:00");
});
