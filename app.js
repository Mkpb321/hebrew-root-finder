// Roots WebApp
// Expects ./data/data.json to exist (relative to index.html)

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
const elFocusGroup = document.getElementById("rootGroup");
const elFocusPill = document.getElementById("rootPill");
const elSearchBtn = document.getElementById("searchBtn");
const elHelpBtn = document.getElementById("helpBtn");
const elHelpOverlay = document.getElementById("helpOverlay");
const elHelpClose = document.getElementById("helpClose");

let rows = [];        // normalized row objects
let rowsNorm = [];    // normalized strings for search
let currentHits = []; // indices currently shown in Treffer
let selectedIdx = null; // focused word (by index)
let selectedRoot = "";  // derived from selected word's root_2

function renderEmpty(targetEl, text) {
  targetEl.innerHTML = `<div class="empty">${escapeHtml(text)}</div>`;
}

function rootLabel(rootsArr) {
  if (!Array.isArray(rootsArr) || rootsArr.length === 0) return "—";
  // root_2 is expected to be one root; if multiple are present, show compactly.
  return rootsArr.length === 1 ? rootsArr[0] : rootsArr.join(" · ");
}

function buildTable() {
  const table = document.createElement("table");
  table.className = "table";
  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-he">Hebräisch</th>
        <th>Deutsch</th>
        <th class="col-root">Wurzel</th>
        <th class="col-lesson">Lektion</th>
        <th class="col-action"></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  return table;
}

function makeRow(row, idx, isSelected = false) {
  const tr = document.createElement("tr");
  tr.dataset.idx = String(idx);
  if (isSelected) tr.classList.add("selected");

  const he = row.hebrew ?? "";
  const de = row.german ?? "";
  const lesson = (row.lesson === 0 || row.lesson) ? `Lektion ${row.lesson}` : "—";
  const root = rootLabel(row.roots);

  tr.innerHTML = `
    <td class="hebrew he">${escapeHtml(he)}</td>
    <td class="de">${escapeHtml(de)}</td>
    <td class="hebrew root">${escapeHtml(root)}</td>
    <td class="lesson">${escapeHtml(lesson)}</td>
    <td class="action">
      <button class="btn btn-ghost focus-btn" type="button" data-focus="${escapeHtml(idx)}" aria-label="Eintrag fokussieren">Fokus</button>
    </td>
  `;

  const focusBtn = tr.querySelector("button[data-focus]");
  if (focusBtn) {
    focusBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      selectHit(idx);
    });
  }
  return tr;
}

function renderTable(targetEl, indices) {
  targetEl.innerHTML = "";
  if (!indices || indices.length === 0) {
    renderEmpty(targetEl, "Keine Treffer. Bitte Suchbegriff anpassen.");
    return;
  }

  const table = buildTable();
  const tbody = table.querySelector("tbody");
  const frag = document.createDocumentFragment();
  for (const idx of indices) {
    frag.appendChild(makeRow(rows[idx], idx, idx === selectedIdx));
  }
  tbody.appendChild(frag);
  targetEl.appendChild(table);
}

function updateFocusPill() {
  if (!elFocusPill) return;

  if (selectedIdx === null || !rows[selectedIdx]) {
    elFocusPill.textContent = "—";
    elFocusPill.setAttribute("disabled", "true");
    return;
  }

  const r = rows[selectedIdx];
  const labelDe = (r.german ?? "").trim();
  const labelHe = (r.hebrew ?? "").trim();
  const label = labelDe ? labelDe : labelHe;

  elFocusPill.textContent = `Fokus: ${label}  ×`;
  elFocusPill.removeAttribute("disabled");
}

function clearFocus() {
  selectedIdx = null;
  selectedRoot = "";
  updateFocusPill();
  renderEmpty(elFocusGroup, "Wähle in den Treffern einen Eintrag über „Fokus“, um Wörter mit gleicher Wurzel zu sehen.");
  renderTable(elHits, currentHits.length ? currentHits : rows.map((_, i) => i));
}

function renderFocusGroup() {
  if (selectedIdx === null || !selectedRoot) {
    renderEmpty(elFocusGroup, "Wähle in den Treffern einen Eintrag über „Fokus“, um Wörter mit gleicher Wurzel zu sehen.");
    return;
  }

  const group = rows
    .map((r, i) => ({ r, i }))
    .filter(x => Array.isArray(x.r.roots) && x.r.roots.includes(selectedRoot));

  if (group.length === 0) {
    renderEmpty(elFocusGroup, "Keine Einträge mit gleicher Wurzel gefunden.");
    return;
  }

  // Render group as table; keep selection highlight.
  const indices = group.map(x => x.i);
  renderTable(elFocusGroup, indices);
}

function applySearch() {
  const qRaw = elQ.value.trim();
  const qHe = stripHebrewDiacritics(qRaw);
  const qLc = normLatin(qRaw);

  if (!qRaw) {
    currentHits = rows.map((_, i) => i);
    renderTable(elHits, currentHits);
    elHitsCount.textContent = String(currentHits.length);
    // keep focus view as-is
    return;
  }

  const hits = [];
  for (let i = 0; i < rowsNorm.length; i++) {
    const n = rowsNorm[i];
    const ok =
      (qHe && n.he_n.includes(qHe)) ||
      (qLc && n.de_n.includes(qLc)) ||
      (qHe && n.root_he_n.includes(qHe)) ||
      (qLc && n.root_lc_n.includes(qLc));
    if (ok) hits.push(i);
  }

  currentHits = hits;
  renderTable(elHits, hits);
  elHitsCount.textContent = String(hits.length);
}

function selectHit(idx) {
  selectedIdx = idx;
  const row = rows[idx];
  selectedRoot = (row?.roots && row.roots[0]) ? row.roots[0] : "";
  updateFocusPill();

  // Update both panels
  renderTable(elHits, currentHits.length ? currentHits : rows.map((_, i) => i));
  renderFocusGroup();

  // Keep selected item visible on mobile
  const node = elHits.querySelector(`tr[data-idx="${CSS.escape(String(idx))}"]`);
  if (node) node.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function loadData() {
  renderEmpty(elHits, "Lade Daten …");
  renderEmpty(elFocusGroup, "Wähle in den Treffern einen Eintrag über „Fokus“, um Wörter mit gleicher Wurzel zu sehen.");

  try {
    const res = await fetch("./data/data.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("data.json muss ein Array sein.");

    rows = data.map((x) => {
      const root2 = x?.root_2;
      const roots = [];
      if (typeof root2 === "string") {
        for (const part of root2.split(",")) {
          const r = part.trim();
          if (r) roots.push(r);
        }
      }

      const german = x?.german ?? x?.de ?? "";
      const germanBase =
        x?.german_base ??
        x?.grundform ??
        x?.de_grundform ??
        x?.german_grundform ??
        x?.de_base ??
        x?.base_de ??
        x?.infinitiv ??
        "";

      return {
        lesson: x?.lesson,
        hebrew: x?.hebrew ?? x?.he ?? "",
        german,
        germanBase,
        roots
      };
    });

    rowsNorm = rows.map((x) => {
      const deCombined = `${x.german ?? ""} ${x.germanBase ?? ""}`.trim();
      const rootJoined = (x.roots ?? []).join(" ");
      return {
        he_n: stripHebrewDiacritics(x.hebrew),
        de_n: normLatin(deCombined),
        root_he_n: stripHebrewDiacritics(rootJoined),
        root_lc_n: normLatin(rootJoined)
      };
    });

    currentHits = rows.map((_, i) => i);
    elHitsCount.textContent = String(currentHits.length);
    renderTable(elHits, currentHits);
    clearFocus();
  } catch (err) {
    console.error(err);
    renderEmpty(elHits, "Fehler: Konnte ./data/data.json nicht laden. Tipp: Starte die Seite über einen lokalen Webserver (nicht per file://).");
    renderEmpty(elFocusGroup, "—");
  }
}

function openHelp() {
  if (!elHelpOverlay) return;
  elHelpOverlay.classList.add("open");
  elHelpOverlay.setAttribute("aria-hidden", "false");
}

function closeHelp() {
  if (!elHelpOverlay) return;
  elHelpOverlay.classList.remove("open");
  elHelpOverlay.setAttribute("aria-hidden", "true");
}

elQ.addEventListener("input", () => applySearch());
elQ.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    applySearch();
  }
  if (e.key === "Escape") {
    elQ.value = "";
    applySearch();
  }
});

if (elSearchBtn) {
  elSearchBtn.addEventListener("click", () => {
    applySearch();
    elQ.focus();
  });
}

if (elHelpBtn) elHelpBtn.addEventListener("click", openHelp);
if (elHelpClose) elHelpClose.addEventListener("click", closeHelp);
if (elFocusPill) {
  elFocusPill.addEventListener("click", () => {
    if (selectedIdx !== null) clearFocus();
  });
}
if (elHelpOverlay) {
  elHelpOverlay.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-close") === "true") closeHelp();
  });
}

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeHelp();
});

window.addEventListener("DOMContentLoaded", () => {
  loadData();
});
