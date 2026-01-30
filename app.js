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
const elRootGroup = document.getElementById("rootGroup");
const elRootPill = document.getElementById("rootPill");
const elSearchBtn = document.getElementById("searchBtn");
const elHelpBtn = document.getElementById("helpBtn");
const elHelpOverlay = document.getElementById("helpOverlay");
const elHelpClose = document.getElementById("helpClose");

let rows = [];        // raw
let rowsNorm = [];    // normalized for search
let currentHits = []; // indices
let selectedIdx = null;
let selectedRoot = "";

function bestRootForRow(row) {
  const stats = row?.rootStats ?? [];
  if (!stats.length) return "";
  let best = stats[0];
  for (const s of stats) {
    if (s.p > best.p) best = s;
  }
  return best.root;
}

function pctToColor(p01) {
  // 0.0 -> red-ish, 1.0 -> green-ish
  const hue = Math.max(0, Math.min(120, p01 * 120));
  return {
    bg: `hsl(${hue} 70% 93%)`,
    border: `hsl(${hue} 55% 72%)`,
    text: `hsl(${hue} 40% 22%)`
  };
}

function renderEmpty(targetEl, text) {
  targetEl.innerHTML = `<div class="empty">${escapeHtml(text)}</div>`;
}

function makeItem(row, idx, isSelected = false) {
  const he = row.hebrew ?? row.he ?? "";
  const de = row.german ?? row.de ?? "";
  const lesson = row.lesson;
  const stats = row.rootStats ?? [];
  const total = row.rootTotal ?? 0;

  const cls = ["item"];
  if (isSelected) cls.push("selected");

  // Use a div with role=button for accessibility + mobile-friendly tap
  const div = document.createElement("div");
  div.className = cls.join(" ");
  div.setAttribute("role", "button");
  div.setAttribute("tabindex", "0");
  div.dataset.idx = String(idx);

  const lessonHtml = (lesson === 0 || lesson)
    ? `<span class="meta-pill" title="Lektion">Lektion ${escapeHtml(lesson)}</span>`
    : "";

  const rootsHtml = (total > 0 && stats.length)
    ? stats.map(s => {
        const pct = Math.round((s.count / total) * 100);
        const c = pctToColor(s.p);
        return `<span class="root-chip hebrew" role="button" tabindex="0" data-root="${escapeHtml(s.root)}" title="${escapeHtml(s.root)} · ${pct}%" style="background:${c.bg};border-color:${c.border};color:${c.text}">${escapeHtml(s.root)} <span class="pct">${pct}%</span></span>`;
      }).join("")
    : `<span class="root-chip root-chip-empty" title="Keine Wurzel">—</span>`;

  div.innerHTML = `
    <div class="item-main">
      <div class="item-top">
        <div class="hebrew he">${escapeHtml(he)}</div>
        ${lessonHtml}
      </div>
      <div class="de">${escapeHtml(de)}</div>
      <div class="roots" aria-label="Wurzeln">${rootsHtml}</div>
    </div>
  `;

  // Root chips: click to show group for that root
  div.querySelectorAll(".root-chip[data-root]").forEach((chip) => {
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      const r = chip.getAttribute("data-root") || "";
      if (!r) return;
      selectedRoot = r;
      selectedIdx = idx;
      renderHits(currentHits.length ? currentHits : rows.map((_, i) => i));
      renderRootGroup(selectedRoot);
    });
    chip.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        chip.click();
      }
    });
  });

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
    .filter(x => (x.r.rootSet?.has(root)));

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
    selectedRoot = "";
    currentHits = rows.map((_, i) => i);
    renderHits(currentHits);
    renderRootGroup("");
    return;
  }

  const hits = [];
  for (let i = 0; i < rowsNorm.length; i++) {
    const n = rowsNorm[i];
    const ok =
      (qHe && n.he_n.includes(qHe)) ||
      (qLc && n.de_n.includes(qLc)) ||
      (qHe && n.roots_he_n.includes(qHe)) ||
      (qLc && n.roots_lc_n.includes(qLc));
    if (ok) hits.push(i);
  }

  selectedIdx = null;
  currentHits = hits;
  renderHits(hits);
  renderRootGroup("");
}

function selectHit(idx) {
  selectedIdx = idx;
  const row = rows[idx];
  if (!row) return;
  if (!selectedRoot || !row.rootSet?.has(selectedRoot)) {
    selectedRoot = bestRootForRow(row);
  }
  renderHits(currentHits.length ? currentHits : rows.map((_, i) => i));
  renderRootGroup(selectedRoot);

  // Keep selected item visible on mobile
  const node = elHits.querySelector(`[data-idx="${CSS.escape(String(idx))}"]`);
  if (node) node.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function loadData() {
  elHits.setAttribute("aria-busy", "true");
  renderEmpty(elHits, "Lade Daten …");
  renderEmpty(elRootGroup, "Wähle oben einen Treffer aus, um alle Wörter mit gleicher Wurzel zu sehen.");

  try {
    const res = await fetch("./data/data.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("data.json muss ein Array sein.");

    rows = data.map((x) => {
      const allRoots = [];
      for (let i = 1; i <= 7; i++) {
        const v = x?.[`root_${i}`];
        if (typeof v !== "string") continue;
        for (const part of v.split(",")) {
          const r = part.trim();
          if (r) allRoots.push(r);
        }
      }

      const total = allRoots.length;
      const counts = new Map();
      const firstPos = new Map();
      allRoots.forEach((r, pos) => {
        counts.set(r, (counts.get(r) ?? 0) + 1);
        if (!firstPos.has(r)) firstPos.set(r, pos);
      });

      const unique = Array.from(counts.keys());
      const stats = unique
        .map((r) => ({
          root: r,
          count: counts.get(r) ?? 0,
          p: total ? (counts.get(r) ?? 0) / total : 0,
          first: firstPos.get(r) ?? 0
        }))
        .sort((a, b) => (b.p - a.p) || (a.first - b.first));

      return {
        lesson: x?.lesson,
        hebrew: x?.hebrew ?? x?.he ?? "",
        german: x?.german ?? x?.de ?? "",
        rootTotal: total,
        rootStats: stats,
        rootSet: new Set(unique)
      };
    });

    rowsNorm = rows.map((x) => ({
      he_n: stripHebrewDiacritics(x.hebrew),
      de_n: normLatin(x.german),
      roots_he_n: stripHebrewDiacritics(Array.from(x.rootSet ?? []).join(" ")),
      roots_lc_n: normLatin(Array.from(x.rootSet ?? []).join(" "))
    }));

    currentHits = rows.map((_, i) => i);
    renderHits(currentHits);
    renderRootGroup("");
  } catch (err) {
    console.error(err);
    renderEmpty(elHits, "Fehler: Konnte ./data/data.json nicht laden. Tipp: Starte die Seite über einen lokalen Webserver (nicht per file://).");
    renderEmpty(elRootGroup, "—");
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
