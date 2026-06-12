const test = require("node:test");
const assert = require("node:assert/strict");

const appModule = require("../app/app.js");

test("extractFeedRecords reads CKAN datastore records", () => {
  assert.equal(typeof appModule.extractFeedRecords, "function");

  const payload = {
    help: "https://example.com",
    success: true,
    result: {
      records: [
        { datum: "2026-05-26", kanal: "Social Media", kurztext: "A" },
        { datum: "2026-05-25", kanal: "Presseverteiler", kurztext: "B" },
      ],
    },
  };

  assert.deepEqual(appModule.extractFeedRecords(payload), payload.result.records);
});

test("normalizeFeedItem maps mixed source fields into a feed item", () => {
  assert.equal(typeof appModule.normalizeFeedItem, "function");

  const item = appModule.normalizeFeedItem({
    datum: "2026-05-26",
    uhrzeit: "14:30",
    kanal: "Amtliche Veröffentlichungen",
    schlagworte: "Verkehr, Innenstadt",
    amt: "Tiefbauamt",
    kurztext: "Straßensperrung ab Donnerstag",
    text: "Ab Donnerstag wird die Musterstraße wegen Bauarbeiten gesperrt.",
    url: "https://example.com/meldung",
  });

  assert.equal(item.channel, "Amtliche Veröffentlichungen");
  assert.equal(item.office, "Tiefbauamt");
  assert.deepEqual(item.tags, ["Verkehr", "Innenstadt"]);
  assert.equal(item.summary, "Straßensperrung ab Donnerstag");
  assert.equal(
    item.fullText,
    "Ab Donnerstag wird die Musterstraße wegen Bauarbeiten gesperrt.",
  );
  assert.equal(item.url, "https://example.com/meldung");
  assert.equal(item.isOfficial, true);
  assert.equal(item.timestamp, "2026-05-26T14:30:00");
});

test("filterFeedItems applies channel, tag, office and range filters together", () => {
  assert.equal(typeof appModule.filterFeedItems, "function");

  const items = [
    appModule.normalizeFeedItem({
      datum: "2026-05-26",
      uhrzeit: "10:15",
      kanal: "Amtliche Veröffentlichungen",
      tags: ["Verkehr", "Baustelle"],
      amt: "Tiefbauamt",
      kurztext: "Baustellenupdate",
    }),
    appModule.normalizeFeedItem({
      datum: "2026-05-22",
      uhrzeit: "09:00",
      kanal: "Social Media",
      tags: ["Kultur"],
      amt: "Kulturamt",
      kurztext: "Open-Air-Woche",
    }),
    appModule.normalizeFeedItem({
      datum: "2026-04-15",
      uhrzeit: "08:00",
      kanal: "Presseverteiler",
      tags: ["Verkehr"],
      amt: "Tiefbauamt",
      kurztext: "Archivmeldung",
    }),
  ];

  const filtered = appModule.filterFeedItems(items, {
    channel: "Amtliche Veröffentlichungen",
    tag: "Verkehr",
    office: "Tiefbauamt",
    range: "7d",
  }, new Date("2026-05-26T12:00:00"));

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].summary, "Baustellenupdate");
});

test("buildLagebild summarizes today count, top tags and newest official post", () => {
  assert.equal(typeof appModule.buildLagebild, "function");

  const items = [
    appModule.normalizeFeedItem({
      datum: "2026-05-26",
      uhrzeit: "12:00",
      kanal: "Amtliche Veröffentlichungen",
      tags: ["Verkehr", "Sicherheit"],
      amt: "Ordnungsamt",
      kurztext: "Hinweis zur Innenstadt",
    }),
    appModule.normalizeFeedItem({
      datum: "2026-05-26",
      uhrzeit: "08:30",
      kanal: "Social Media",
      tags: ["Verkehr"],
      amt: "Pressestelle",
      kurztext: "Morgendlicher Hinweis",
    }),
    appModule.normalizeFeedItem({
      datum: "2026-05-24",
      uhrzeit: "17:00",
      kanal: "Presseverteiler",
      tags: ["Kultur"],
      amt: "Kulturamt",
      kurztext: "Wochenprogramm",
    }),
  ];

  const lagebild = appModule.buildLagebild(items, "2026-05-26T16:00:00");

  assert.equal(lagebild.todayCount, 2);
  assert.equal(lagebild.featuredOfficial.office, "Ordnungsamt");
  assert.equal(lagebild.featuredOfficial.summary, "Hinweis zur Innenstadt");
  assert.deepEqual(lagebild.topTags.slice(0, 2), [
    { tag: "Verkehr", count: 2 },
    { tag: "Sicherheit", count: 1 },
  ]);
});

test("buildOdasProxyEndpoint keeps only path and query for proxy requests", () => {
  assert.equal(typeof appModule.buildOdasProxyEndpoint, "function");

  const endpoint = appModule.buildOdasProxyEndpoint(
    "/app/",
    "https://open-data-musterstadt.ckan.de/dataset/demo/resource/abc/download/feed.json?download=1",
  );

  assert.equal(
    endpoint,
    "/app/odp-data?path=%2Fdataset%2Fdemo%2Fresource%2Fabc%2Fdownload%2Ffeed.json%3Fdownload%3D1",
  );
});

test("loadFeedItems uses ODAS proxy content when proxyAktiv is enabled", async () => {
  assert.equal(typeof appModule.loadFeedItems, "function");

  const originalFetch = global.fetch;
  const originalWindow = global.window;
  const calls = [];

  global.window = { location: { pathname: "/app/" } };
  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });

    return {
      ok: true,
      async json() {
        return {
          content: JSON.stringify([
            {
              datum: "2026-05-26",
              uhrzeit: "08:45",
              kanal: "Amtliche Veröffentlichungen",
              schlagworte: ["Bauen"],
              amt: "Tiefbauamt",
              kurztext: "Proxy-Meldung",
            },
          ]),
        };
      },
      async text() {
        return "";
      },
    };
  };

  try {
    const result = await appModule.loadFeedItems(
      {
        apiurl:
          "https://open-data-musterstadt.ckan.de/dataset/demo/resource/abc/download/feed.json",
        urlDaten:
          "https://open-data-musterstadt.ckan.de/dataset/demo/resource/abc",
        proxyAktiv: "ja",
      },
      new Date("2026-05-26T12:00:00"),
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, "POST");
    assert.equal(
      calls[0].url,
      "/app/odp-data?path=%2Fdataset%2Fdemo%2Fresource%2Fabc%2Fdownload%2Ffeed.json",
    );
    assert.equal(result.notice, "");
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].summary, "Proxy-Meldung");
  } finally {
    global.fetch = originalFetch;
    global.window = originalWindow;
  }
});

test("fetchFeedPayload loads JSON directly when proxyAktiv is disabled", async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return [{ kurztext: "Direkt geladen" }];
      },
    };
  };

  try {
    const payload = await appModule.fetchFeedPayload(
      "https://open-data-musterstadt.ckan.de/direct.json",
      { proxyAktiv: "nein" },
    );

    assert.deepEqual(payload, [{ kurztext: "Direkt geladen" }]);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://open-data-musterstadt.ckan.de/direct.json");
    assert.equal(calls[0].options.method, undefined);
  } finally {
    global.fetch = originalFetch;
  }
});
