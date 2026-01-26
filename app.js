// Roots WebApp
// Expects ./data/roots.json to exist (relative to index.html)

const DIACRITICS_RE = /[\u0591-\u05C7]/g; // cantillation + niqqud

function stripHebrewDiacritics(s) {
  return String(s ?? "").replace(DIACRITICS_RE, "");
}

function normLatin(s) {
  return String(s ?? "").toLowerCase();
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const elQ = document.getElementById("q");
const elHits = document.getElementById("hits");
const elHitsCount = document.getElementById("hitsCount");
const elRootGroup = document.getElementById("rootGroup");
const elRootPill = document.getElementById("rootPill");
const elStatus = document.getElementById("status");
const elClear = document.getElementById("clearBtn");

let rows = [];        // raw
let rowsNorm = [];    // normalized for search
let currentHits = []; // indices
let selectedIdx = null;

function setStatus(text) {
  elStatus.textContent = text;
}

function renderEmpty(targetEl, text) {
  targetEl.innerHTML = `<div class="empty">${escapeHtml(text)}</div>`;
}

function makeItem(row, idx, isSelected = false) {
  const he = row.hebrew ?? row.he ?? "";
  const de = row.german ?? row.de ?? "";
  const root = row.root ?? "";

  const cls = ["item"];
  if (isSelected) cls.push("selected");

  // Use a div with role=button for accessibility + mobile-friendly tap
  const div = document.createElement("div");
  div.className = cls.join(" ");
  div.setAttribute("role", "button");
  div.setAttribute("tabindex", "0");
  div.dataset.idx = String(idx);

  div.innerHTML = `
    <div class="item-main">
      <div class="hebrew he">${escapeHtml(he)}</div>
      <div class="de">${escapeHtml(de)}</div>
    </div>
    <div class="root-badge hebrew" title="${escapeHtml(root)}">${escapeHtml(root || "—")}</div>
  `;

  div.addEventListener("click", () => selectHit(idx));
  div.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectHit(idx);
    }
  });

  return div;
}

function renderHits(hitIndices) {
  elHits.setAttribute("aria-busy", "false");
  elHits.innerHTML = "";

  elHitsCount.textContent = String(hitIndices.length);

  if (hitIndices.length === 0) {
    renderEmpty(elHits, "Keine Treffer. Bitte Suchbegriff anpassen.");
    return;
  }

  const frag = document.createDocumentFragment();
  for (const idx of hitIndices) {
    frag.appendChild(makeItem(rows[idx], idx, idx === selectedIdx));
  }
  elHits.appendChild(frag);
}

function renderRootGroup(root) {
  elRootGroup.innerHTML = "";

  if (!root) {
    elRootPill.textContent = "—";
    renderEmpty(elRootGroup, "Wähle oben einen Treffer aus, um alle Wörter mit gleicher Wurzel zu sehen.");
    return;
  }

  const group = rows
    .map((r, i) => ({ r, i }))
    .filter(x => (x.r.root ?? "") === root);

  elRootPill.textContent = `${root} · ${group.length}`;

  if (group.length === 0) {
    renderEmpty(elRootGroup, "Keine Einträge für diese Wurzel gefunden.");
    return;
  }

  const frag = document.createDocumentFragment();
  for (const { r, i } of group) {
    frag.appendChild(makeItem(r, i, i === selectedIdx));
  }
  elRootGroup.appendChild(frag);
}

function applySearch() {
  const qRaw = elQ.value.trim();
  const qHe = stripHebrewDiacritics(qRaw);
  const qLc = normLatin(qRaw);

  if (!qRaw) {
    selectedIdx = null;
    currentHits = rows.map((_, i) => i);
    renderHits(currentHits);
    renderRootGroup("");
    setStatus(`Bereit · ${rows.length} Einträge`);
    return;
  }

  const hits = [];
  for (let i = 0; i < rowsNorm.length; i++) {
    const n = rowsNorm[i];
    const ok =
      (qHe && n.he_n.includes(qHe)) ||
      (qLc && n.de_n.includes(qLc)) ||
      (qLc && n.root_n.includes(qLc));
    if (ok) hits.push(i);
  }

  selectedIdx = null;
  currentHits = hits;
  renderHits(hits);
  renderRootGroup("");
  setStatus(`Suche: "${qRaw}" · Treffer: ${hits.length}`);
}

function selectHit(idx) {
  selectedIdx = idx;
  const root = rows[idx]?.root ?? "";
  renderHits(currentHits.length ? currentHits : rows.map((_, i) => i));
  renderRootGroup(root);

  // Keep selected item visible on mobile
  const node = elHits.querySelector(`[data-idx="${CSS.escape(String(idx))}"]`);
  if (node) node.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function loadData() {
  elHits.setAttribute("aria-busy", "true");
  setStatus("Lade Daten …");
  renderEmpty(elHits, "Lade Daten …");
  renderEmpty(elRootGroup, "Wähle oben einen Treffer aus, um alle Wörter mit gleicher Wurzel zu sehen.");

  try {
    const res = await fetch("./data/roots.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("roots.json muss ein Array sein.");

    rows = data.map(x => ({
      hebrew: x.hebrew ?? x.he ?? "",
      german: x.german ?? x.de ?? "",
      root: x.root ?? ""
    }));

    rowsNorm = rows.map(x => ({
      he_n: stripHebrewDiacritics(x.hebrew),
      de_n: normLatin(x.german),
      root_n: normLatin(x.root)
    }));

    currentHits = rows.map((_, i) => i);
    renderHits(currentHits);
    renderRootGroup("");
    setStatus(`Bereit · ${rows.length} Einträge`);
  } catch (err) {
    console.error(err);
    setStatus("Fehler beim Laden von ./data/roots.json");
    renderEmpty(elHits, "Fehler: Konnte ./data/roots.json nicht laden. Tipp: Starte die Seite über einen lokalen Webserver (nicht per file://).");
    renderEmpty(elRootGroup, "—");
  }
}

elQ.addEventListener("input", () => applySearch());
elClear.addEventListener("click", () => {
  elQ.value = "";
  elQ.focus();
  applySearch();
});

window.addEventListener("DOMContentLoaded", () => {
  loadData();
});
