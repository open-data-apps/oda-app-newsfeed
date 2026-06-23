const DEFAULT_FILTERS = {
  channel: "alle",
  tag: "alle",
  office: "alle",
  range: "30d",
};

const CHANNEL_LABELS = {
  "Amtliche Veröffentlichungen": "Amtlich",
  "Presseverteiler": "Presse",
  "Social Media": "Social",
};

const appState = {
  filters: { ...DEFAULT_FILTERS },
  items: [],
  allItems: [],
  now: new Date(),
  notice: "",
  sourceUrl: "",
  root: null,
  requestId: 0,
};

function app(configdata = {}, enclosingHtmlDivElement) {
  appState.requestId += 1;
  const requestId = appState.requestId;
  appState.root = enclosingHtmlDivElement;
  appState.filters = { ...DEFAULT_FILTERS };
  appState.now = new Date();
  appState.sourceUrl = cleanString(configdata.urlDaten || configdata.apiurl);

  renderLoadingState(enclosingHtmlDivElement, configdata);

  loadFeedItems(configdata, appState.now)
    .then((result) => {
      if (requestId !== appState.requestId) {
        return;
      }

      appState.allItems = result.items;
      appState.items = result.items;
      appState.notice = result.notice;
      appState.sourceUrl = result.sourceUrl;

      renderFeedApp(configdata);
    })
    .catch((error) => {
      if (requestId !== appState.requestId) {
        return;
      }

      enclosingHtmlDivElement.innerHTML = renderFatalError(error);
    });
}

function addToHead() {}

async function loadFeedItems(configdata, now) {
  const apiurl = cleanString(configdata.apiurl);
  const sourceUrl = cleanString(configdata.urlDaten || apiurl);
  const proxyEnabled = isOdasProxyEnabled(configdata);

  if (!apiurl) {
    return {
      items: sortFeedItems(createDemoFeedRecords(now).map(normalizeFeedItem)),
      notice:
        "Es ist keine externe Datenquelle konfiguriert. Die App zeigt deshalb Beispieldaten.",
      sourceUrl,
      dataOrigin: "demo",
    };
  }

  try {
    const payload = await fetchFeedPayload(apiurl, configdata);
    const records = extractFeedRecords(payload);
    const items = sortFeedItems(
      records
        .map((record, index) => normalizeFeedItem(record, index, now))
        .filter(Boolean),
    );

    return {
      items,
      notice: items.length
        ? ""
        : "Die konfigurierte Datenquelle wurde geladen, enthält aber aktuell keine Meldungen.",
      sourceUrl,
      dataOrigin: proxyEnabled ? "proxy" : "remote",
    };
  } catch (error) {
    return {
      items: sortFeedItems(createDemoFeedRecords(now).map(normalizeFeedItem)),
      notice: buildLoadFailureNotice(proxyEnabled),
      sourceUrl,
      error,
      dataOrigin: "demo-fallback",
    };
  }
}

async function fetchFeedPayload(targetUrl, configdata = {}, fetchImpl = fetch) {
  if (isOdasProxyEnabled(configdata)) {
    return fetchJsonViaOdasProxy(targetUrl, fetchImpl);
  }

  const response = await fetchImpl(targetUrl);
  if (!response.ok) {
    throw new Error(`Datenquelle antwortet mit Status ${response.status}.`);
  }

  return response.json();
}

function isOdasProxyEnabled(configdata = {}) {
  return cleanString(configdata.proxyAktiv).toLowerCase() === "ja";
}

function extractPathFromUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch (error) {
    return url;
  }
}

function buildOdasProxyEndpoint(locationPathname = "/", targetUrl) {
  const normalizedPath = `/${cleanString(locationPathname)
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")}`;

  return `${normalizedPath}/odp-data?path=${encodeURIComponent(
    extractPathFromUrl(targetUrl),
  )}`;
}

function getCurrentLocationPathname() {
  if (
    typeof window !== "undefined" &&
    window.location &&
    typeof window.location.pathname === "string"
  ) {
    return window.location.pathname;
  }

  return "/";
}

async function fetchJsonViaOdasProxy(targetUrl, fetchImpl = fetch) {
  const proxyUrl = buildOdasProxyEndpoint(getCurrentLocationPathname(), targetUrl);
  const response = await fetchImpl(proxyUrl, { method: "POST" });

  if (!response.ok) {
    throw new Error(`Proxy-Fehler: HTTP ${response.status}`);
  }

  const proxyPayload = await response.json();
  if (!proxyPayload || typeof proxyPayload.content !== "string") {
    throw new Error("Proxy-Antwort enthaelt keinen content-String");
  }

  return JSON.parse(proxyPayload.content);
}

function buildLoadFailureNotice(proxyEnabled) {
  if (proxyEnabled) {
    return "Die konfigurierte Datenquelle konnte auch über den ODAS-Proxy nicht geladen werden. Zur Vorschau werden Beispieldaten angezeigt.";
  }

  return "Die konfigurierte Datenquelle konnte nicht direkt geladen werden. Zur Vorschau werden Beispieldaten angezeigt. Falls die Quelle CORS blockiert, aktiviere den ODAS-Proxy.";
}

function extractFeedRecords(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  if (Array.isArray(payload.records)) {
    return payload.records;
  }

  if (payload.result && Array.isArray(payload.result.records)) {
    return payload.result.records;
  }

  const candidates = ["items", "data", "results", "entries", "meldungen"];
  for (const key of candidates) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  return [];
}

function normalizeFeedItem(rawItem = {}, index = 0, referenceNow = new Date()) {
  const rawDate =
    getFirstValue(rawItem, [
      "datum",
      "date",
      "veroeffentlichungsdatum",
      "veröffentlichungsdatum",
      "published_at",
      "publishedAt",
      "created",
    ]) || formatIsoDate(referenceNow);
  const rawTime =
    getFirstValue(rawItem, ["uhrzeit", "time", "zeit", "published_time"]) ||
    "";
  const dateInfo = normalizeDateTime(rawDate, rawTime, referenceNow);
  const channel = canonicalizeChannel(
    getFirstValue(rawItem, ["kanal", "channel", "quelle", "medium"]) ||
      "Presseverteiler",
  );
  const office =
    getFirstValue(rawItem, [
      "amt",
      "stelle",
      "office",
      "department",
      "veroeffentlichende_stelle",
      "veröffentlichende_stelle",
      "organisation",
      "publisher",
    ]) || "Unbekannte Stelle";
  const tags = parseTags(
    getFirstValue(rawItem, [
      "tags",
      "tag",
      "schlagworte",
      "schlagwort",
      "keywords",
      "themen",
    ]),
  );
  const summary =
    getFirstValue(rawItem, [
      "kurztext",
      "summary",
      "teaser",
      "excerpt",
      "headline",
      "titel",
      "title",
    ]) || "";
  const fullText =
    getFirstValue(rawItem, [
      "text",
      "volltext",
      "gesamter_text",
      "content",
      "beschreibung",
      "body",
    ]) || summary;
  const url = cleanString(
    getFirstValue(rawItem, ["url", "link", "href", "publication_url"]),
  );
  const normalizedSummary = cleanString(summary) || deriveSummaryFromText(fullText);
  const normalizedFullText = cleanString(fullText) || normalizedSummary;
  const title =
    getFirstValue(rawItem, ["titel", "title", "headline"]) ||
    normalizedSummary ||
    `Meldung ${index + 1}`;

  return {
    id:
      getFirstValue(rawItem, ["id", "_id", "uuid"]) ||
      `${dateInfo.timestamp}-${slugify(title)}-${index}`,
    title: cleanString(title) || `Meldung ${index + 1}`,
    summary: normalizedSummary,
    fullText: normalizedFullText,
    channel,
    office: cleanString(office),
    tags,
    url,
    timestamp: dateInfo.timestamp,
    timestampMs: dateInfo.timestampMs,
    dateLabel: dateInfo.dateLabel,
    timeLabel: dateInfo.timeLabel,
    dateKey: dateInfo.dateKey,
    isOfficial: channel === "Amtliche Veröffentlichungen",
  };
}

function filterFeedItems(items, filters = {}, nowInput = new Date()) {
  const now = normalizeReferenceDate(nowInput);
  const channelFilter = filters.channel || "alle";
  const tagFilter = filters.tag || "alle";
  const officeFilter = filters.office || "alle";
  const rangeFilter = filters.range || "30d";

  return items.filter((item) => {
    if (channelFilter !== "alle" && item.channel !== channelFilter) {
      return false;
    }

    if (tagFilter !== "alle" && !item.tags.includes(tagFilter)) {
      return false;
    }

    if (officeFilter !== "alle" && item.office !== officeFilter) {
      return false;
    }

    return matchesRange(item, rangeFilter, now);
  });
}

function buildLagebild(items, nowInput = new Date()) {
  const now = normalizeReferenceDate(nowInput);
  const todayKey = formatIsoDate(now);
  const todayItems = items.filter((item) => item.dateKey === todayKey);
  const featuredOfficial =
    items.find((item) => item.isOfficial) || null;
  const tagCounts = new Map();
  const channelCounts = new Map();
  const officeCounts = new Map();

  items.forEach((item) => {
    channelCounts.set(item.channel, (channelCounts.get(item.channel) || 0) + 1);
    officeCounts.set(item.office, (officeCounts.get(item.office) || 0) + 1);
    item.tags.forEach((tag) => {
      const previous = tagCounts.get(tag) || { count: 0, latestMs: 0 };
      tagCounts.set(tag, {
        count: previous.count + 1,
        latestMs: Math.max(previous.latestMs, item.timestampMs),
      });
    });
  });

  return {
    totalCount: items.length,
    todayCount: todayItems.length,
    officialCount: items.filter((item) => item.isOfficial).length,
    activeOfficeCount: officeCounts.size,
    featuredOfficial,
    topTags: Array.from(tagCounts.entries())
      .map(([tag, info]) => ({ tag, count: info.count, latestMs: info.latestMs }))
      .sort((left, right) => {
        if (right.count !== left.count) {
          return right.count - left.count;
        }
        if (right.latestMs !== left.latestMs) {
          return right.latestMs - left.latestMs;
        }
        return left.tag.localeCompare(right.tag, "de");
      })
      .slice(0, 6)
      .map(({ tag, count }) => ({ tag, count })),
    channelBreakdown: sortCountMap(channelCounts, "channel"),
    topOffices: sortCountMap(officeCounts, "office").slice(0, 3),
  };
}

function renderDatenfrische() {
  const items = appState.allItems || [];
  if (!items.length) return "";
  const newest = items[0];
  if (!newest || !newest.dateLabel) return "";
  const zeit = newest.timeLabel ? ` um ${escapeHtml(newest.timeLabel)} Uhr` : "";
  return `<p class="feed-freshness text-muted small mb-0">Aktualisiert: ${escapeHtml(newest.dateLabel)}${zeit}</p>`;
}

function renderWeitereInfos(configdata = {}) {
  const links = String(configdata.weiterfuehrendeLinks || "").trim();
  if (!links) return "";
  return (
    '<section class="news-weitere-infos card-surface">' +
    '<p class="section-kicker">Weitere Informationen</p>' +
    "<div>" +
    links +
    "</div>" +
    "</section>"
  );
}

function renderMethodikbox(configdata = {}) {
  const hinweis = String(configdata.datenquelleHinweis || "").trim();
  const stand = String(configdata.datenStand || "").trim();
  if (!hinweis && !stand) return "";
  const standHtml = stand
    ? `<p class="text-muted small mb-2">${escapeHtml(stand)}</p>`
    : "";
  return (
    '<section class="news-methodik card-surface">' +
    '<button class="news-methodik-toggle collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#news-methodik-body" aria-expanded="false" aria-controls="news-methodik-body">' +
    '<span class="section-kicker">Methodik &amp; Datenquelle</span>' +
    '<span class="news-methodik-chevron" aria-hidden="true">&#9662;</span>' +
    "</button>" +
    '<div id="news-methodik-body" class="collapse mt-2">' +
    standHtml +
    hinweis +
    "</div>" +
    "</section>"
  );
}

function renderFeedApp(configdata = {}) {
  const filteredItems = filterFeedItems(
    appState.allItems,
    appState.filters,
    appState.now,
  );
  const lagebild = buildLagebild(filteredItems, appState.now);
  const filterOptions = buildFilterOptions(appState.allItems);
  const root = appState.root;

  if (!root) {
    return;
  }

  root.innerHTML = `
    <section class="news-shell">
      <div class="feed-hero card-surface">
        <div class="feed-hero__copy">
          <p class="feed-eyebrow">Presse-Feed</p>
          <h2 class="feed-hero__title">Aktuelle Veröffentlichungen auf einen Blick</h2>
          <p class="feed-hero__lead">
            Der Nachrichtenstrom bündelt Social-Media-Posts, amtliche Veröffentlichungen
            und Presseverteiler in einer gemeinsamen, filterbaren Ansicht.
          </p>
          ${renderSourceLink()}
          ${renderDatenfrische()}
          ${renderNotice()}
        </div>
        ${renderFeaturedOfficial(lagebild.featuredOfficial)}
      </div>

      <section class="summary-grid">
        ${renderMetricCard("Meldungen heute", lagebild.todayCount, "Im gewählten Datenbestand", configdata.kpiKontext1, 1)}
        ${renderMetricCard("Sichtbare Meldungen", lagebild.totalCount, "Nach aktueller Filterung", configdata.kpiKontext2, 2)}
        ${renderMetricCard("Aktive Stellen", lagebild.activeOfficeCount, "Mit mindestens einer Meldung", configdata.kpiKontext3, 3)}
        ${renderMetricCard("Amtliche Meldungen", lagebild.officialCount, "Mit hervorgehobener Priorität", configdata.kpiKontext4, 4)}
      </section>

      <section class="filter-panel card-surface">
        <div class="filter-panel__header">
          <div>
            <p class="section-kicker">Filter</p>
            <h3 class="section-title">Nach Kanal, Thema und Stelle eingrenzen</h3>
          </div>
          <button type="button" class="btn btn-reset-feed" data-action="reset-filters">
            Filter zurücksetzen
          </button>
        </div>
        <div class="row g-3">
          <div class="col-12 col-md-6 col-xl-3">
            <label class="form-label" for="feed-filter-channel">Kanal</label>
            <select class="form-select" id="feed-filter-channel" data-filter="channel">
              ${renderSelectOptions("Alle Kanäle", filterOptions.channels, appState.filters.channel)}
            </select>
          </div>
          <div class="col-12 col-md-6 col-xl-3">
            <label class="form-label" for="feed-filter-tag">Tag</label>
            <select class="form-select" id="feed-filter-tag" data-filter="tag">
              ${renderSelectOptions("Alle Tags", filterOptions.tags, appState.filters.tag)}
            </select>
          </div>
          <div class="col-12 col-md-6 col-xl-3">
            <label class="form-label" for="feed-filter-office">Amt / Stelle</label>
            <select class="form-select" id="feed-filter-office" data-filter="office">
              ${renderSelectOptions("Alle Stellen", filterOptions.offices, appState.filters.office)}
            </select>
          </div>
          <div class="col-12 col-md-6 col-xl-3">
            <label class="form-label" for="feed-filter-range">Zeitraum</label>
            <select class="form-select" id="feed-filter-range" data-filter="range">
              ${renderRangeOptions(appState.filters.range)}
            </select>
          </div>
        </div>
      </section>

      <section class="glance-grid">
        <div class="card-surface glance-card">
          <p class="section-kicker">Kanäle</p>
          <div class="glance-pills">
            ${renderChannelBreakdown(lagebild.channelBreakdown)}
          </div>
        </div>
        <div class="card-surface glance-card">
          <p class="section-kicker">Top-Tags</p>
          <div class="glance-pills">
            ${renderTopTags(lagebild.topTags)}
          </div>
        </div>
        <div class="card-surface glance-card">
          <p class="section-kicker">Zuletzt aktive Stellen</p>
          <div class="glance-list">
            ${renderTopOffices(lagebild.topOffices)}
          </div>
        </div>
      </section>

      <section class="feed-list">
        <div class="feed-list__header">
          <div>
            <p class="section-kicker">Feed</p>
            <h3 class="section-title">Chronologischer Nachrichtenstrom</h3>
          </div>
          <span class="feed-count">${filteredItems.length} Einträge</span>
        </div>
        ${renderFeedItems(filteredItems)}
      </section>

      ${renderMethodikbox(configdata)}
      ${renderWeitereInfos(configdata)}
    </section>
  `;

  bindFeedInteractions(configdata);
}

function renderLoadingState(root, configdata = {}) {
  root.innerHTML = `
    <section class="news-shell">
      <div class="feed-hero card-surface feed-hero--loading">
        <div class="loading-dot"></div>
        <div>
          <p class="feed-eyebrow">Presse-Feed</p>
          <h2 class="feed-hero__title">Nachrichten werden geladen</h2>
          <p class="feed-hero__lead">
            ${cleanString(configdata.apiurl)
              ? isOdasProxyEnabled(configdata)
                ? "Die konfigurierte Datenquelle wird über den ODAS-Proxy geladen und aufbereitet."
                : "Die konfigurierte Datenquelle wird geladen und aufbereitet."
              : "Die App bereitet eine Vorschau des Nachrichtenstroms vor."}
          </p>
        </div>
      </div>
    </section>
  `;
}

function renderFatalError(error) {
  return `
    <section class="empty-feed-state">
      <p class="section-kicker">Fehler</p>
      <h2>Der Nachrichtenstream konnte nicht aufgebaut werden.</h2>
      <p>${escapeHtml(error.message || "Unbekannter Fehler.")}</p>
    </section>
  `;
}

function renderMetricCard(label, value, hint, kontext, idx) {
  const k = String(kontext || "").trim();
  const n = idx || 0;
  const kontextHtml = k
    ? `<button class="metric-card__info-toggle collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#news-kpi-kontext-${n}" aria-expanded="false" aria-controls="news-kpi-kontext-${n}" aria-label="Erklärung zu diesem Wert"><span class="metric-card__info-icon" aria-hidden="true">ⓘ</span></button><div id="news-kpi-kontext-${n}" class="collapse"><div class="metric-card__kontext">${escapeHtml(k)}</div></div>`
    : "";
  return `
    <article class="metric-card card-surface">
      <p class="metric-card__label">${escapeHtml(label)}</p>
      <strong class="metric-card__value">${escapeHtml(String(value))}</strong>
      <span class="metric-card__hint">${escapeHtml(hint)}</span>
      ${kontextHtml}
    </article>
  `;
}

function renderSourceLink() {
  if (!appState.sourceUrl) {
    return `<p class="feed-source">Datenquelle: lokale Vorschau ohne konfigurierten ODP-Link.</p>`;
  }

  return `
    <p class="feed-source">
      Datenquelle:
      <a href="${escapeHtml(appState.sourceUrl)}" target="_blank" rel="noreferrer">
        ${escapeHtml(appState.sourceUrl)}
      </a>
    </p>
  `;
}

function renderNotice() {
  if (!appState.notice) {
    return "";
  }

  return `<div class="feed-notice">${escapeHtml(appState.notice)}</div>`;
}

function renderFeaturedOfficial(item) {
  if (!item) {
    return `
      <aside class="featured-official featured-official--empty">
        <p class="section-kicker">Amtlicher Fokus</p>
        <h3>Aktuell keine amtliche Veröffentlichung im Feed</h3>
        <p>Sobald entsprechende Meldungen vorhanden sind, werden sie hier hervorgehoben.</p>
      </aside>
    `;
  }

  return `
    <aside class="featured-official">
      <p class="section-kicker">Amtlicher Fokus</p>
      <h3>${escapeHtml(item.summary)}</h3>
      <p class="featured-official__meta">
        ${escapeHtml(item.office)} · ${escapeHtml(item.dateLabel)} · ${escapeHtml(item.timeLabel)}
      </p>
      <p>${escapeHtml(item.fullText)}</p>
      ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Zur Originalquelle</a>` : ""}
    </aside>
  `;
}

function renderSelectOptions(defaultLabel, values, selectedValue) {
  const options = [
    `<option value="alle"${selectedValue === "alle" ? " selected" : ""}>${escapeHtml(defaultLabel)}</option>`,
  ];

  values.forEach((value) => {
    options.push(
      `<option value="${escapeHtml(value)}"${value === selectedValue ? " selected" : ""}>${escapeHtml(value)}</option>`,
    );
  });

  return options.join("");
}

function renderRangeOptions(selectedValue) {
  const ranges = [
    { value: "today", label: "Heute" },
    { value: "7d", label: "Letzte 7 Tage" },
    { value: "30d", label: "Letzte 30 Tage" },
    { value: "all", label: "Gesamter Zeitraum" },
  ];

  return ranges
    .map(
      (range) =>
        `<option value="${range.value}"${range.value === selectedValue ? " selected" : ""}>${escapeHtml(range.label)}</option>`,
    )
    .join("");
}

function renderChannelBreakdown(channelBreakdown) {
  if (!channelBreakdown.length) {
    return `<span class="muted-inline">Keine Kanäle im aktuellen Filter.</span>`;
  }

  return channelBreakdown
    .map(
      (entry) => `
        <span class="glance-pill ${getChannelClass(entry.channel)}">
          ${escapeHtml(entry.channel)} <strong>${entry.count}</strong>
        </span>
      `,
    )
    .join("");
}

function renderTopTags(topTags) {
  if (!topTags.length) {
    return `<span class="muted-inline">Aktuell keine Tags vorhanden.</span>`;
  }

  return topTags
    .map(
      (entry) => `
        <span class="glance-pill glance-pill--tag">
          #${escapeHtml(entry.tag)} <strong>${entry.count}</strong>
        </span>
      `,
    )
    .join("");
}

function renderTopOffices(topOffices) {
  if (!topOffices.length) {
    return `<span class="muted-inline">Noch keine aktiven Stellen im Filter.</span>`;
  }

  return topOffices
    .map(
      (entry) => `
        <div class="glance-list__item">
          <span>${escapeHtml(entry.office)}</span>
          <strong>${entry.count}</strong>
        </div>
      `,
    )
    .join("");
}

function renderFeedItems(items) {
  if (!items.length) {
    return `
      <article class="empty-feed-state card-surface">
        <h4>Keine Meldungen im aktuellen Filter</h4>
        <p>Bitte wähle einen anderen Zeitraum oder entferne einzelne Filter.</p>
      </article>
    `;
  }

  return items
    .map(
      (item) => `
        <article class="feed-card card-surface${item.isOfficial ? " feed-card--official" : ""}">
          <div class="feed-card__header">
            <div class="feed-card__meta">
              <span class="channel-badge ${getChannelClass(item.channel)}">${escapeHtml(CHANNEL_LABELS[item.channel] || item.channel)}</span>
              <span class="feed-card__stamp">${escapeHtml(item.dateLabel)} · ${escapeHtml(item.timeLabel)}</span>
            </div>
            <strong class="feed-card__office">${escapeHtml(item.office)}</strong>
          </div>
          <h4 class="feed-card__title">${escapeHtml(item.summary)}</h4>
          <div class="feed-card__tags">
            ${item.tags.length
              ? item.tags
                  .map((tag) => `<span class="tag-chip">#${escapeHtml(tag)}</span>`)
                  .join("")
              : `<span class="muted-inline">Keine Tags</span>`}
          </div>
          <details class="feed-card__details">
            <summary>Details anzeigen</summary>
            <div class="feed-card__body">
              <p>${formatParagraphs(item.fullText)}</p>
              ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">Zur Publikation</a>` : ""}
            </div>
          </details>
        </article>
      `,
    )
    .join("");
}

function bindFeedInteractions(configdata) {
  if (!appState.root) {
    return;
  }

  appState.root.querySelectorAll("[data-filter]").forEach((element) => {
    element.addEventListener("change", (event) => {
      const key = event.target.getAttribute("data-filter");
      appState.filters[key] = event.target.value;
      renderFeedApp(configdata);
    });
  });

  const resetButton = appState.root.querySelector("[data-action='reset-filters']");
  if (resetButton) {
    resetButton.addEventListener("click", () => {
      appState.filters = { ...DEFAULT_FILTERS };
      renderFeedApp(configdata);
    });
  }
}

function buildFilterOptions(items) {
  const channels = new Set();
  const tags = new Set();
  const offices = new Set();

  items.forEach((item) => {
    channels.add(item.channel);
    offices.add(item.office);
    item.tags.forEach((tag) => tags.add(tag));
  });

  return {
    channels: Array.from(channels).sort((left, right) => left.localeCompare(right, "de")),
    tags: Array.from(tags).sort((left, right) => left.localeCompare(right, "de")),
    offices: Array.from(offices).sort((left, right) => left.localeCompare(right, "de")),
  };
}

function getFirstValue(source, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        return value;
      }
    }
  }

  return "";
}

function normalizeDateTime(dateValue, timeValue, referenceNow = new Date()) {
  const timeParts = normalizeTimeParts(timeValue);
  const parsedDate = parseDateValue(dateValue, referenceNow);
  const year = parsedDate.getFullYear();
  const month = padNumber(parsedDate.getMonth() + 1);
  const day = padNumber(parsedDate.getDate());
  const hours = padNumber(timeParts.hours);
  const minutes = padNumber(timeParts.minutes);

  return {
    timestamp: `${year}-${month}-${day}T${hours}:${minutes}:00`,
    timestampMs: new Date(`${year}-${month}-${day}T${hours}:${minutes}:00`).getTime(),
    dateLabel: `${day}.${month}.${year}`,
    timeLabel: `${hours}:${minutes}`,
    dateKey: `${year}-${month}-${day}`,
  };
}

function parseDateValue(dateValue, referenceNow = new Date()) {
  if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
    return new Date(dateValue.getTime());
  }

  const normalized = cleanString(dateValue);
  if (!normalized) {
    return normalizeReferenceDate(referenceNow);
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) {
    const [datePart] = normalized.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  if (/^\d{2}\.\d{2}\.\d{4}$/.test(normalized)) {
    const [day, month, year] = normalized.split(".").map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return normalizeReferenceDate(referenceNow);
}

function normalizeTimeParts(timeValue) {
  const normalized = cleanString(timeValue);
  if (!normalized) {
    return { hours: 9, minutes: 0 };
  }

  const match = normalized.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    return { hours: 9, minutes: 0 };
  }

  return {
    hours: Number(match[1]),
    minutes: Number(match[2]),
  };
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => cleanString(entry))
      .filter(Boolean);
  }

  const normalized = cleanString(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/[,;|]/)
    .map((entry) => cleanString(entry))
    .filter(Boolean);
}

function canonicalizeChannel(value) {
  const normalized = cleanString(value).toLowerCase();

  if (normalized.includes("amtlich") || normalized.includes("bekanntmach")) {
    return "Amtliche Veröffentlichungen";
  }

  if (normalized.includes("social") || normalized.includes("instagram") || normalized.includes("facebook")) {
    return "Social Media";
  }

  if (normalized.includes("presse")) {
    return "Presseverteiler";
  }

  return cleanString(value) || "Presseverteiler";
}

function matchesRange(item, range, now) {
  if (range === "all") {
    return true;
  }

  if (range === "today") {
    return item.dateKey === formatIsoDate(now);
  }

  const deltaMap = {
    "7d": 7,
    "30d": 30,
  };
  const days = deltaMap[range];

  if (!days) {
    return true;
  }

  const threshold = new Date(now);
  threshold.setHours(0, 0, 0, 0);
  threshold.setDate(threshold.getDate() - (days - 1));

  return item.timestampMs >= threshold.getTime();
}

function sortFeedItems(items) {
  return [...items].sort((left, right) => {
    if (right.timestampMs !== left.timestampMs) {
      return right.timestampMs - left.timestampMs;
    }

    return left.summary.localeCompare(right.summary, "de");
  });
}

function sortCountMap(counterMap, keyName) {
  return Array.from(counterMap.entries())
    .map(([key, count]) => ({ [keyName]: key, count }))
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return String(left[keyName]).localeCompare(String(right[keyName]), "de");
    });
}

function deriveSummaryFromText(text) {
  const normalized = cleanString(text);
  if (!normalized) {
    return "Ohne Kurztext";
  }

  const firstSentence = normalized.split(/(?<=[.!?])\s+/)[0];
  return firstSentence.slice(0, 140);
}

function cleanString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim();
}

function slugify(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeReferenceDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  return date;
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function formatIsoDate(date) {
  return [
    date.getFullYear(),
    padNumber(date.getMonth() + 1),
    padNumber(date.getDate()),
  ].join("-");
}

function getChannelClass(channel) {
  return `channel-${slugify(channel)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatParagraphs(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function createDemoFeedRecords(referenceNow = new Date()) {
  const isoDate = (daysAgo) => {
    const date = new Date(referenceNow);
    date.setDate(date.getDate() - daysAgo);
    return formatIsoDate(date);
  };

  return [
    {
      datum: isoDate(0),
      uhrzeit: "14:30",
      kanal: "Amtliche Veröffentlichungen",
      schlagworte: ["Verkehr", "Innenstadt"],
      amt: "Tiefbauamt",
      kurztext: "Neue Verkehrsführung rund um die Musterbrücke",
      text: "Wegen Bauarbeiten gilt ab morgen eine geänderte Verkehrsführung rund um die Musterbrücke. Die Umleitung ist ausgeschildert und betrifft insbesondere den Berufsverkehr.",
      url: "https://example.org/amtlich/musterbruecke",
    },
    {
      datum: isoDate(0),
      uhrzeit: "12:10",
      kanal: "Social Media",
      schlagworte: ["Veranstaltung", "Innenstadt"],
      amt: "Pressestelle",
      kurztext: "Livestream zur Bürgerfragestunde heute um 18 Uhr",
      text: "Die Stadt informiert heute um 18 Uhr live über aktuelle Projekte und beantwortet Fragen aus der Bevölkerung direkt im Stream.",
      url: "https://example.org/social/buergerfragestunde",
    },
    {
      datum: isoDate(0),
      uhrzeit: "09:00",
      kanal: "Presseverteiler",
      schlagworte: ["Bildung", "Jugend"],
      amt: "Schulverwaltungsamt",
      kurztext: "Start des Sommerferienprogramms angekündigt",
      text: "Das Sommerferienprogramm bietet Workshops, Sportangebote und Ferienbetreuung an mehreren Standorten im Stadtgebiet.",
      url: "https://example.org/presse/sommerferienprogramm",
    },
    {
      datum: isoDate(1),
      uhrzeit: "16:45",
      kanal: "Amtliche Veröffentlichungen",
      schlagworte: ["Sicherheit", "Stadtfest"],
      amt: "Ordnungsamt",
      kurztext: "Sicherheitskonzept für das Stadtfest veröffentlicht",
      text: "Zum Stadtfest werden zusätzliche Sperrzonen, Rettungswege und Informationspunkte eingerichtet. Besucherinnen und Besucher werden gebeten, frühzeitig anzureisen.",
      url: "https://example.org/amtlich/stadtfest",
    },
    {
      datum: isoDate(2),
      uhrzeit: "11:20",
      kanal: "Social Media",
      schlagworte: ["Klima", "Mobilität"],
      amt: "Klimaschutzstelle",
      kurztext: "Mitmachaktion zur Fahrradwoche gestartet",
      text: "Die Stadt sammelt Lieblingsrouten, Wünsche und Hinweise rund um das Radwegenetz. Beiträge können bis Ende der Woche eingereicht werden.",
      url: "https://example.org/social/fahrradwoche",
    },
    {
      datum: isoDate(4),
      uhrzeit: "08:15",
      kanal: "Presseverteiler",
      schlagworte: ["Kultur", "Innenstadt"],
      amt: "Kulturamt",
      kurztext: "Open-Air-Reihe belebt den Marktplatz",
      text: "An vier Abenden finden kostenlose Konzerte auf dem Marktplatz statt. Das Programm richtet sich an Familien und junge Erwachsene.",
      url: "https://example.org/presse/open-air-reihe",
    },
    {
      datum: isoDate(8),
      uhrzeit: "10:00",
      kanal: "Amtliche Veröffentlichungen",
      schlagworte: ["Bauen", "Beteiligung"],
      amt: "Stadtplanungsamt",
      kurztext: "Bebauungsplan fuer das Hafenquartier ausgelegt",
      text: "Der Bebauungsplan fuer das Hafenquartier liegt bis Ende des Monats aus. Stellungnahmen koennen digital oder vor Ort eingereicht werden.",
      url: "https://example.org/amtlich/hafenquartier",
    },
    {
      datum: isoDate(15),
      uhrzeit: "13:40",
      kanal: "Presseverteiler",
      schlagworte: ["Soziales", "Gesundheit"],
      amt: "Sozialamt",
      kurztext: "Hitzehilfe startet mit erweiterten Oeffnungszeiten",
      text: "Die kommunalen Anlaufstellen bieten ab sofort laengere Oeffnungszeiten, Trinkwasser und Beratung fuer besonders belastete Personengruppen an.",
      url: "https://example.org/presse/hitzehilfe",
    },
  ];
}

const exportedApi = {
  addToHead,
  app,
  buildLagebild,
  buildOdasProxyEndpoint,
  canonicalizeChannel,
  createDemoFeedRecords,
  extractFeedRecords,
  extractPathFromUrl,
  filterFeedItems,
  fetchFeedPayload,
  fetchJsonViaOdasProxy,
  isOdasProxyEnabled,
  loadFeedItems,
  normalizeFeedItem,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = exportedApi;
}
