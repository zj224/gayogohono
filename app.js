"use strict";

/* =========================================================================
   Gayogo̱hó:nǫˀ Lexicon — front end
   Ports the coloring/shorthand logic from shorthands.py + dictionary.py to
   the browser, stores the working dictionary in cookies, and can push it to
   a branch on GitHub as one JSON file per group, nested under a Category
   folder — Particles/Pronouns/emphatic_pronouns_particles.json — with
   ungrouped entries going to Particles/Other/other_particles.json (as well
   as any group that hasn't been assigned a category yet). Same layout under
   Words/ and Phrases/, so each grammatical family lives in its own file
   instead of one big particles.json / words.json / phrases.json.
   ========================================================================= */

const GITHUB_OWNER = "zj224";
const GITHUB_REPO = "gayogohono";
const GITHUB_BRANCH_DEFAULT = "main";
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH_DEFAULT}/`;
const API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

const GROUP_FOLDER = { particles: "Particles", words: "Words", phrases: "Phrases" };
const OTHER_FOLDER = "Other";

/* "possessive pronouns" -> "possessive_pronouns"; no group -> "other". */
function slugifyGroup(name) {
  const slug = (name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "other";
}

/* A category is a folder name the user typed, e.g. "Pronouns" — kept as
   entered (so casing is the user's choice), just made filesystem-safe. */
function sanitizeCategory(name) {
  const cleaned = (name || "").trim().replace(/[\\/:*?"<>|]+/g, "_");
  return cleaned || OTHER_FOLDER;
}

function groupFileName(storeName, group) {
  return `${slugifyGroup(group)}_${storeName}.json`;
}

/* Where one entry's shard file lives for a given group it belongs to:
     no group             -> Particles/Other/other_particles.json
     group, no category   -> Particles/Other/<group>_particles.json
     group + category     -> Particles/<Category>/<group>_particles.json */
function shardPath(storeName, category, group) {
  const folder = GROUP_FOLDER[storeName];
  if (!group) return `${folder}/${OTHER_FOLDER}/${groupFileName(storeName, null)}`;
  const sub = category && category.trim() ? sanitizeCategory(category) : OTHER_FOLDER;
  return `${folder}/${sub}/${groupFileName(storeName, group)}`;
}

/* Splits a store's entries into per-group shards, keyed by full repo path,
   e.g. "Particles/Pronouns/emphatic_pronouns_particles.json". An entry
   belonging to more than one group is duplicated into each of those groups'
   shards (all under the same single Category, since that's one field per
   entry — an entry that spans categories would need to be re-split by hand). */
function buildShards(storeName) {
  const shards = new Map();
  Object.entries(state[storeName]).forEach(([key, entry]) => {
    const groups = entry.groups && entry.groups.length ? entry.groups : [null];
    groups.forEach((g) => {
      const path = shardPath(storeName, entry.category, g);
      if (!shards.has(path)) shards.set(path, {});
      shards.get(path)[key] = entry;
    });
  });
  return shards;
}

const GRAMMAR_TYPES = ["pronoun", "verb", "noun", "particle", "adjective", "adverb", "conjunction"];

const TYPE_VAR = {
  pronoun: "--type-pronoun",
  verb: "--type-verb",
  noun: "--type-noun",
  particle: "--type-particle",
  adjective: "--type-adjective",
  adverb: "--type-adverb",
  conjunction: "--type-conjunction",
};

const state = { particles: {}, words: {}, phrases: {} };

const STORE_SINGULAR = { particles: "particle", words: "word", phrases: "phrase" };
const currentDetailKey = { particle: null, word: null, phrase: null };

/* --------------------------------------------------------------------- */
/* Shorthand / coloring, ported from shorthands.py and dictionary.py     */
/* --------------------------------------------------------------------- */

const SHORTHANDS = {
  an: "ą", en: "ę", on: "ǫ",
  "a-": "a̱", "e-": "e̱", "i-": "i̱", "o-": "o̱", "u-": "u̱",
  "an-": "ą̱", "en-": "ę̱", "on-": "ǫ̱",
  "a!": "á", "e!": "é", "i!": "í", "o!": "ó", "u!": "ú",
  "an!": "ą́", "en!": "ę́", "on!": "ǫ́",
  "?": "ˀ",
};

function translateToGayogohono(text) {
  let out = text || "";
  for (const [shortcut, special] of Object.entries(SHORTHANDS)) {
    out = out.split("{" + shortcut + "}").join(special);
  }
  return out;
}

const DEVOICING = {
  "a-": "a", "e-": "e", "i-": "i", "o-": "o", "u-": "u",
  "an-": "{an}", "en-": "{en}", "on-": "{on}",
};

function stripDevoicing(text) {
  let out = text || "";
  for (const [devoiced, plain] of Object.entries(DEVOICING)) {
    out = out.split("{" + devoiced + "}").join(plain);
  }
  return out;
}

function colorForType(type) {
  const varName = TYPE_VAR[type] || "--type-unknown";
  return `var(${varName})`;
}

/* Parses "...{word, type}..." tags out of an English gloss, as in
   color_english_text() in shorthands.py. */
function parseGlossTokens(text) {
  const tokens = [];
  const re = /\{([^{},]+),\s*([^{}]+)\}/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(text || "")) !== null) {
    if (m.index > lastIndex) tokens.push({ kind: "text", value: text.slice(lastIndex, m.index) });
    tokens.push({ kind: "tag", word: m[1].trim(), type: m[2].trim() });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < (text || "").length) tokens.push({ kind: "text", value: text.slice(lastIndex) });
  return tokens;
}

/* --------------------------------------------------------------------- */
/* DOM helpers                                                           */
/* --------------------------------------------------------------------- */

function el(tag, opts = {}) {
  const e = document.createElement(tag);
  if (opts.class) e.className = opts.class;
  if (opts.text !== undefined) e.textContent = opts.text;
  return e;
}

function coloredSpan(text, type) {
  const s = el("span", { text });
  s.style.color = colorForType(type);
  return s;
}

/* Renders a gloss string (with optional {word, type} tags) as a mix of
   text nodes and colored spans. If wrapType is given, the whole thing is
   wrapped in a span colored by that type (matching lookup_particle's
   whole-meaning coloring); otherwise returns a bare fragment. */
function glossFragment(text, wrapType) {
  const container = wrapType ? el("span") : document.createDocumentFragment();
  if (wrapType) container.style.color = colorForType(wrapType);
  for (const tok of parseGlossTokens(text)) {
    if (tok.kind === "text") {
      container.appendChild(document.createTextNode(tok.value));
    } else {
      container.appendChild(coloredSpan(tok.word, tok.type));
    }
  }
  return container;
}

function appendJoined(parent, nodes, sep) {
  nodes.forEach((n, i) => {
    if (i > 0) parent.appendChild(document.createTextNode(sep));
    parent.appendChild(n);
  });
}

/* Strips {word, type} tag syntax down to plain "word" text, for use in a
   title="" attribute (which can't render colored spans like glossFragment
   does — just plain text). */
function glossPlainText(text) {
  return (text || "").replace(/\{([^{},]+),\s*([^{}]+)\}/g, (_, word) => word.trim());
}

function keyDisplay(key) {
  const translated = translateToGayogohono(key);
  return translated !== key ? `'${key}' (${translated})` : `'${key}'`;
}

/* --------------------------------------------------------------------- */
/* Particle / word / phrase rendering, ported from dictionary.py         */
/* --------------------------------------------------------------------- */

function buildColoredParticlesWord(particleKeys) {
  const frag = document.createDocumentFragment();
  for (const pkey of particleKeys) {
    const p = state.particles[pkey];
    if (!p) {
      const span = coloredSpan(translateToGayogohono(pkey), "unknown");
      span.dataset.tooltip = `missing particle: ${pkey}`;
      frag.appendChild(span);
      continue;
    }
    const span = coloredSpan(translateToGayogohono(p.text), p.type);
    span.dataset.tooltip = `${p.type}: ${glossPlainText(p.meaning)}`;
    frag.appendChild(span);
  }
  return frag;
}

/* One <span> per particle: colored text + "(type: meaning)" or "(meaning)". */
function buildParticleBreakdownPieces(particleKeys, withType) {
  return particleKeys.map((pkey) => {
    const p = state.particles[pkey];
    const piece = el("span", { class: "result-piece" });
    if (!p) {
      piece.textContent = `missing particle: ${pkey}`;
      return piece;
    }
    piece.appendChild(coloredSpan(translateToGayogohono(p.text), p.type));
    if (withType) piece.append(` (${p.type}: `);
    else piece.append(" (");
    piece.appendChild(glossFragment(p.meaning));
    piece.append(")");
    return piece;
  });
}

function coloredWordText(wordKey) {
  const w = state.words[wordKey];
  if (!w) return coloredSpan(translateToGayogohono(wordKey), "unknown");
  const particleKeys = w.particles || [];
  if (!particleKeys.length) return coloredSpan(translateToGayogohono(w.word), w.type);
  return buildColoredParticlesWord(particleKeys);
}

function renderNotFound(container, label, key) {
  container.innerHTML = "";
  container.appendChild(el("p", { class: "result-empty", text: `No ${label} found for ${keyDisplay(key)}` }));
}

function appendMeaningsBlock(container, entry, wrapType) {
  if (entry.meanings && entry.meanings.length) {
    const alsoLine = el("div", { class: "result-line" });
    alsoLine.append("also: ");
    appendJoined(alsoLine, entry.meanings.map((m) => glossFragment(m, wrapType)), "; ");
    container.appendChild(alsoLine);
  }
}

function appendSpellingsAndGroups(container, entry) {
  if (entry.spellings && entry.spellings.length) {
    const line = el("div", { class: "result-line" });
    line.append("also spelled: ");
    line.append(entry.spellings.map(translateToGayogohono).join(", "));
    container.appendChild(line);
  }
  if (entry.groups && entry.groups.length) {
    const line = el("div", { class: "result-line" });
    line.append("groups: ");
    entry.groups.forEach((g, i) => {
      if (i > 0) line.append(" ");
      line.appendChild(el("span", { class: "group-chip", text: g }));
    });
    container.appendChild(line);
  }
  if (entry.category) {
    const line = el("div", { class: "result-line" });
    line.append("category: ");
    line.appendChild(el("span", { class: "group-chip", text: entry.category }));
    container.appendChild(line);
  }
}

function appendNotesAndExamples(container, entry) {
  if (entry.notes) {
    container.appendChild(el("div", { class: "result-line", text: `notes: ${entry.notes}` }));
  }
  if (entry.examples && entry.examples.length) {
    container.appendChild(el("div", { class: "result-line", text: "examples:" }));
    entry.examples.forEach((ex) => {
      container.appendChild(el("div", { class: "result-line", text: `– ${translateToGayogohono(ex)}` }));
    });
  }
}

function renderLookupParticle(key, containerId = "result-lookup-particle") {
  const container = document.getElementById(containerId);
  const p = state.particles[key];
  if (!p) return renderNotFound(container, "particle", key);

  container.innerHTML = "";
  const head = el("div", { class: "result-headword" });
  head.appendChild(coloredSpan(translateToGayogohono(p.text), p.type));
  container.appendChild(head);

  const typeLine = el("div", { class: "result-line" });
  const chip = el("span", { class: "type-chip", text: p.type });
  chip.style.background = colorForType(p.type);
  typeLine.append("type: ");
  typeLine.appendChild(chip);
  container.appendChild(typeLine);

  const meaningLine = el("div", { class: "result-line" });
  meaningLine.append("meaning: ");
  meaningLine.appendChild(glossFragment(p.meaning, p.type));
  container.appendChild(meaningLine);

  appendMeaningsBlock(container, p, p.type);
  appendSpellingsAndGroups(container, p);
  appendNotesAndExamples(container, p);
}

function renderLookupWord(key, containerId = "result-lookup-word") {
  const container = document.getElementById(containerId);
  const w = state.words[key];
  if (!w) return renderNotFound(container, "word", key);

  container.innerHTML = "";
  const particleKeys = w.particles || [];

  const head = el("div", { class: "result-headword" });
  if (!particleKeys.length) head.appendChild(coloredSpan(translateToGayogohono(w.word), w.type));
  else head.appendChild(buildColoredParticlesWord(particleKeys));
  container.appendChild(head);

  const meaningLine = el("div", { class: "result-line" });
  meaningLine.append("meaning: ");
  meaningLine.appendChild(glossFragment(w.meaning));
  container.appendChild(meaningLine);

  appendMeaningsBlock(container, w);
  appendSpellingsAndGroups(container, w);

  if (particleKeys.length) {
    const madeOfLine = el("div", { class: "result-line" });
    madeOfLine.append("made of: ");
    appendJoined(madeOfLine, buildParticleBreakdownPieces(particleKeys, true), " + ");
    container.appendChild(madeOfLine);
  }

  appendNotesAndExamples(container, w);
}

function renderLookupPhrase(key, containerId = "result-lookup-phrase") {
  const container = document.getElementById(containerId);
  const ph = state.phrases[key];
  if (!ph) return renderNotFound(container, "phrase", key);

  container.innerHTML = "";
  const wordKeys = ph.words || [];

  const head = el("div", { class: "result-headword" });
  if (!wordKeys.length) {
    head.textContent = translateToGayogohono(ph.phrase);
  } else {
    appendJoined(head, wordKeys.map((wkey) => coloredWordText(wkey)), " ");
  }
  container.appendChild(head);

  const meaningLine = el("div", { class: "result-line" });
  meaningLine.append("meaning: ");
  meaningLine.appendChild(glossFragment(ph.meaning));
  container.appendChild(meaningLine);

  appendMeaningsBlock(container, ph);
  appendSpellingsAndGroups(container, ph);

  if (wordKeys.length) {
    const madeOfLine = el("div", { class: "result-line" });
    madeOfLine.append("made of: ");
    const breakdownPieces = wordKeys.map((wkey) => {
      const w = state.words[wkey];
      const piece = el("span", { class: "result-piece" });
      piece.appendChild(coloredWordText(wkey));
      if (w) {
        piece.append(" (");
        piece.appendChild(glossFragment(w.meaning));
        piece.append(")");
      } else {
        piece.append(` (missing word: ${wkey})`);
      }
      return piece;
    });
    appendJoined(madeOfLine, breakdownPieces, " + ");
    container.appendChild(madeOfLine);

    const particlesLine = el("div", { class: "result-line" });
    particlesLine.append("particles: ");
    const particleGroups = wordKeys.map((wkey) => {
      const w = state.words[wkey];
      const group = el("span", { class: "result-piece" });
      if (w && w.particles && w.particles.length) {
        appendJoined(group, buildParticleBreakdownPieces(w.particles, false), " ");
      } else if (w) {
        group.appendChild(coloredWordText(wkey));
        group.append(" (");
        group.appendChild(glossFragment(w.meaning));
        group.append(")");
      } else {
        group.appendChild(coloredWordText(wkey));
        group.append(` (missing word: ${wkey})`);
      }
      return group;
    });
    appendJoined(particlesLine, particleGroups, " + ");
    container.appendChild(particlesLine);
  }

  appendNotesAndExamples(container, ph);
}

/* --------------------------------------------------------------------- */
/* Cookie storage                                                        */
/* --------------------------------------------------------------------- */

const COOKIE_MAX_CHUNK = 3000; // conservative, well under the ~4KB/cookie browser limit
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400; // 400 days -- Chrome's current cap on cookie lifetime

function setCookie(name, value) {
  document.cookie = `${name}=${value}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}

function getCookie(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp("(?:^|; )" + escaped + "=([^;]*)"));
  return match ? match[1] : null;
}

function deleteCookie(name) {
  document.cookie = `${name}=; max-age=0; path=/`;
}

function saveStoreToCookies(storeName) {
  const encoded = encodeURIComponent(JSON.stringify(state[storeName]));
  const chunks = [];
  for (let i = 0; i < encoded.length; i += COOKIE_MAX_CHUNK) {
    chunks.push(encoded.slice(i, i + COOKIE_MAX_CHUNK));
  }
  const prevCount = parseInt(getCookie(`gyh_${storeName}_n`) || "0", 10);
  for (let i = 0; i < prevCount; i++) deleteCookie(`gyh_${storeName}_${i}`);
  chunks.forEach((chunk, i) => setCookie(`gyh_${storeName}_${i}`, chunk));
  setCookie(`gyh_${storeName}_n`, String(chunks.length));
}

function loadStoreFromCookies(storeName) {
  const count = parseInt(getCookie(`gyh_${storeName}_n`) || "0", 10);
  if (!count) return null;
  let encoded = "";
  for (let i = 0; i < count; i++) {
    const chunk = getCookie(`gyh_${storeName}_${i}`);
    if (chunk === null) return null;
    encoded += chunk;
  }
  try {
    return JSON.parse(decodeURIComponent(encoded));
  } catch (err) {
    console.error(`Failed to parse cookie data for ${storeName}`, err);
    return null;
  }
}

/* --------------------------------------------------------------------- */
/* Import from GitHub + init                                             */
/* --------------------------------------------------------------------- */

/* The repo tree is fetched once (one API call) so all three stores' group
   files — at any folder depth, e.g. Particles/Pronouns/foo.json — can be
   located; each shard is then pulled from the raw/cached CDN, not the
   rate-limited API, and merged back into one flat store object. Also reused
   by the publish flow (against the target branch) to find each store's
   existing files, so stale ones (an emptied/renamed/recategorized group)
   can be cleaned up. */
async function fetchGithubTree(branch) {
  const res = await fetch(`${API_BASE}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GitHub tree fetch failed: ${res.status}`);
  const data = await res.json();
  return data.tree || [];
}

function pathsForStore(storeName, tree) {
  const prefix = `${GROUP_FOLDER[storeName]}/`;
  return tree.filter((entry) => entry.type === "blob" && entry.path.startsWith(prefix) && entry.path.endsWith(".json"));
}

/* Reads the (Category, Group) a shard file implies from its own path, e.g.
   "Particles/Pronouns/personal_pronouns_particles.json" -> group "Personal
   Pronouns", category "Pronouns"; "Particles/Other/other_particles.json" ->
   no group at all. This is what lets a JSON file dropped straight into the
   right folder show up correctly in Browse without also having to carry
   "groups"/"category" fields on every entry inside it. */
function sectionFromPath(storeName, path) {
  const parts = path.split("/");
  const categoryFolder = parts[1];
  const filename = parts[parts.length - 1];
  const suffix = `_${storeName}.json`;
  const slug = filename.endsWith(suffix) ? filename.slice(0, -suffix.length) : filename.replace(/\.json$/, "");
  if (slug === "other") return { group: null, category: null };
  const group = slug
    .split("_")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
  const category = categoryFolder === OTHER_FOLDER ? null : categoryFolder;
  return { group, category };
}

/* Folds one shard file's entries into `merged`, filling in any entry's
   missing "groups"/"category" from where the file itself lives (see
   sectionFromPath) rather than requiring those fields to already be on the
   entry. A key found in more than one shard (an entry that belongs to
   several groups) has its groups/category unioned rather than the later
   file clobbering the earlier one. */
function mergeShardInto(merged, shard, inferredGroup, inferredCategory) {
  Object.entries(shard).forEach(([key, entry]) => {
    const groups = new Set(entry.groups || []);
    if (inferredGroup && ![...groups].some((g) => slugifyGroup(g) === slugifyGroup(inferredGroup))) {
      groups.add(inferredGroup);
    }
    const withInferred = { ...entry };
    if (groups.size) withInferred.groups = [...groups];
    if (!withInferred.category && inferredCategory) withInferred.category = inferredCategory;

    const existing = merged[key];
    if (!existing) {
      merged[key] = withInferred;
      return;
    }
    const unionGroups = new Set([...(existing.groups || []), ...(withInferred.groups || [])]);
    merged[key] = {
      ...existing,
      ...withInferred,
      ...(unionGroups.size ? { groups: [...unionGroups] } : {}),
      category: existing.category || withInferred.category,
    };
  });
}

async function fetchStoreFromGithub(storeName, tree) {
  const paths = pathsForStore(storeName, tree).map((entry) => entry.path);

  const merged = {};
  const shardsInOrder = await Promise.all(
    paths.map(async (path) => {
      const res = await fetch(RAW_BASE + path, { cache: "no-store" });
      if (!res.ok) throw new Error(`GitHub fetch failed for ${path}: ${res.status}`);
      return { path, data: await res.json() };
    })
  );
  // Merge sequentially (not inside the Promise.all above) so the union-merge
  // in mergeShardInto is deterministic regardless of fetch completion order.
  shardsInOrder.forEach(({ path, data }) => {
    const { group, category } = sectionFromPath(storeName, path);
    mergeShardInto(merged, data, group, category);
  });
  return merged;
}

function setSyncStatus(kind, text) {
  document.getElementById("syncDot").className = `dot ${kind}`;
  document.getElementById("syncText").textContent = text;
}

/* GitHub is always tried first on every load — the cookie snapshot is only
   a fallback for when GitHub can't be reached (offline), not the default
   source, so newly published data (or a file dropped straight into the repo
   by hand) always shows up without any manual step. */
async function initApp() {
  setSyncStatus("", "loading…");

  try {
    const tree = await fetchGithubTree(GITHUB_BRANCH_DEFAULT);
    await Promise.all(
      Object.keys(GROUP_FOLDER).map(async (storeName) => {
        state[storeName] = await fetchStoreFromGithub(storeName, tree);
        saveStoreToCookies(storeName);
      })
    );
    setSyncStatus("ok", "loaded from GitHub");
  } catch (err) {
    console.error(err);
    const missing = [];
    for (const storeName of Object.keys(GROUP_FOLDER)) {
      const fromCookie = loadStoreFromCookies(storeName);
      if (fromCookie) state[storeName] = fromCookie;
      else missing.push(storeName);
    }
    setSyncStatus("warn", missing.length === 0 ? "could not reach GitHub — showing last loaded copy" : "could not reach GitHub — starting empty");
  }

  refreshDatalists();
  renderAllBrowseLists();
}

/* Manual re-sync mid-session, e.g. after someone else just published while
   you were working. Loading itself already always re-fetches (see above),
   so this only matters for a page that's been open a while — it still warns,
   since anything added/edited here but not yet Published would be lost. */
async function refreshFromGithub() {
  if (!confirm("Reload all data from GitHub? Anything added or edited here since your last Publish will be lost.")) return;
  await initApp();
}

function wireRefreshButton() {
  document.getElementById("refreshFromGithub").addEventListener("click", refreshFromGithub);
}

/* --------------------------------------------------------------------- */
/* Datalists (autocomplete for particle/word/phrase keys)                */
/* --------------------------------------------------------------------- */

function fillDatalist(id, keys) {
  const listEl = document.getElementById(id);
  listEl.innerHTML = "";
  [...keys].sort().forEach((k) => {
    const opt = document.createElement("option");
    opt.value = k;
    listEl.appendChild(opt);
  });
}

function allGroupsIn(storeName) {
  const groups = new Set();
  Object.values(state[storeName]).forEach((entry) => {
    (entry.groups || []).forEach((g) => groups.add(g));
  });
  return groups;
}

function allCategoriesIn(storeName) {
  const categories = new Set();
  Object.values(state[storeName]).forEach((entry) => {
    if (entry.category) categories.add(entry.category);
  });
  return categories;
}

function refreshDatalists() {
  fillDatalist("particleKeysList", Object.keys(state.particles));
  fillDatalist("wordKeysList", Object.keys(state.words));
  fillDatalist("phraseKeysList", Object.keys(state.phrases));
  fillDatalist("particleGroupsList", allGroupsIn("particles"));
  fillDatalist("wordGroupsList", allGroupsIn("words"));
  fillDatalist("phraseGroupsList", allGroupsIn("phrases"));
  fillDatalist("particleCategoriesList", allCategoriesIn("particles"));
  fillDatalist("wordCategoriesList", allCategoriesIn("words"));
  fillDatalist("phraseCategoriesList", allCategoriesIn("phrases"));
}

/* --------------------------------------------------------------------- */
/* Tabs / panel switching                                                */
/* --------------------------------------------------------------------- */

function activatePanel(panelId) {
  document.querySelectorAll("[data-panel]").forEach((p) => p.classList.toggle("active", p.id === panelId));
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === panelId));
  document.querySelectorAll(".tab-group").forEach((g) => g.classList.toggle("has-active", !!g.querySelector(".tab.active")));
  document.querySelectorAll(".tab-group.open").forEach((g) => g.classList.remove("open"));
  if (panelId.startsWith("browse-")) renderBrowseList(panelId.slice("browse-".length) + "s");
}

function wireTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => activatePanel(btn.dataset.tab));
  });
  document.querySelectorAll(".back-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      activatePanel(link.dataset.backTab);
    });
  });
}

/* Dropdown groups open on hover via CSS; this adds click-to-toggle so they
   also work on touch devices, which have no hover. */
function wireTabDropdowns() {
  document.querySelectorAll(".tab-group-label").forEach((label) => {
    label.addEventListener("click", (e) => {
      e.stopPropagation();
      const group = label.closest(".tab-group");
      const wasOpen = group.classList.contains("open");
      document.querySelectorAll(".tab-group.open").forEach((g) => g.classList.remove("open"));
      if (!wasOpen) group.classList.add("open");
    });
  });
  document.addEventListener("click", () => {
    document.querySelectorAll(".tab-group.open").forEach((g) => g.classList.remove("open"));
  });
}

/* --------------------------------------------------------------------- */
/* Browse lists — every particle/word/phrase, colored, with a tooltip and */
/* a link through to its detail page.                                    */
/* --------------------------------------------------------------------- */

function buildBrowseRow(storeName, key) {
  const entry = state[storeName][key];
  const row = el("div", { class: "browse-row" });

  const link = document.createElement("a");
  link.href = "#";
  link.className = "browse-key";
  link.dataset.store = storeName;
  link.dataset.key = key;
  link.dataset.tooltip =
    storeName === "particles" ? `${entry.type}: ${glossPlainText(entry.meaning)}` : glossPlainText(entry.meaning);

  if (storeName === "particles") {
    link.appendChild(coloredSpan(translateToGayogohono(entry.text), entry.type));
  } else if (storeName === "words") {
    link.appendChild(coloredWordText(key));
  } else {
    const wordKeys = entry.words || [];
    if (wordKeys.length) appendJoined(link, wordKeys.map((wk) => coloredWordText(wk)), " ");
    else link.textContent = translateToGayogohono(entry.phrase);
  }
  row.appendChild(link);

  const meaning = el("div", { class: "browse-meaning" });
  meaning.appendChild(glossFragment(entry.meaning));
  row.appendChild(meaning);

  return row;
}

/* Two-level: Category heading > Group heading > rows, mirroring the
   Category/Group folder layout entries publish to. A group with no Category
   (or a truly ungrouped entry) is collected under a final "Other" section;
   an entry belonging to more than one group appears once under each. */
function renderBrowseList(storeName) {
  const singular = STORE_SINGULAR[storeName];
  const container = document.getElementById(`browse-list-${storeName}`);
  container.innerHTML = "";

  const keys = Object.keys(state[storeName]);
  if (!keys.length) {
    container.appendChild(el("p", { class: "result-empty", text: `No ${singular}s yet.` }));
    return;
  }

  const categoryMap = new Map(); // category -> Map<group, keys[]>
  const ungrouped = [];

  keys.forEach((key) => {
    const entry = state[storeName][key];
    if (!entry.groups || !entry.groups.length) {
      ungrouped.push(key);
      return;
    }
    const category = entry.category && entry.category.trim() ? entry.category : OTHER_FOLDER;
    if (!categoryMap.has(category)) categoryMap.set(category, new Map());
    const groupMap = categoryMap.get(category);
    entry.groups.forEach((g) => {
      if (!groupMap.has(g)) groupMap.set(g, []);
      groupMap.get(g).push(key);
    });
  });

  const categoryNames = [...categoryMap.keys()].sort((a, b) => {
    if (a === OTHER_FOLDER) return 1;
    if (b === OTHER_FOLDER) return -1;
    return a.localeCompare(b);
  });

  categoryNames.forEach((category) => {
    container.appendChild(el("h2", { class: "browse-category-heading", text: category }));
    const groupMap = categoryMap.get(category);
    [...groupMap.keys()].sort((a, b) => a.localeCompare(b)).forEach((groupName) => {
      container.appendChild(el("h3", { class: "browse-group-heading", text: groupName }));
      groupMap.get(groupName).sort().forEach((key) => container.appendChild(buildBrowseRow(storeName, key)));
    });
  });

  if (ungrouped.length) {
    if (!categoryNames.includes(OTHER_FOLDER)) {
      container.appendChild(el("h2", { class: "browse-category-heading", text: OTHER_FOLDER }));
    }
    container.appendChild(el("h3", { class: "browse-group-heading", text: "Ungrouped" }));
    ungrouped.sort().forEach((key) => container.appendChild(buildBrowseRow(storeName, key)));
  }
}

function renderAllBrowseLists() {
  Object.keys(STORE_SINGULAR).forEach(renderBrowseList);
}

function navigateToDetail(storeName, key) {
  const singular = STORE_SINGULAR[storeName];
  currentDetailKey[singular] = key;
  const bodyId = `detail-${singular}-body`;
  if (storeName === "particles") renderLookupParticle(key, bodyId);
  if (storeName === "words") renderLookupWord(key, bodyId);
  if (storeName === "phrases") renderLookupPhrase(key, bodyId);
  document.getElementById(`detail-${singular}-title`).textContent = keyDisplay(key);
  activatePanel(`detail-${singular}`);
}

function wireBrowseLinks() {
  document.addEventListener("click", (e) => {
    const link = e.target.closest(".browse-key");
    if (!link) return;
    e.preventDefault();
    navigateToDetail(link.dataset.store, link.dataset.key);
  });
}

/* --------------------------------------------------------------------- */
/* Edit — prefills the matching Add form from a detail page and jumps    */
/* there, reusing its existing create-or-update save logic.              */
/* --------------------------------------------------------------------- */

function setTypeSelect(selectEl, customField, customInput, typeValue) {
  const known = GRAMMAR_TYPES.includes(typeValue);
  selectEl.value = known ? typeValue : "__other__";
  customField.hidden = known;
  customInput.required = !known;
  customInput.value = known ? "" : typeValue || "";
}

function notesAsString(notes) {
  return typeof notes === "string" ? notes : "";
}

function fillParticleForm(key) {
  const p = state.particles[key];
  if (!p) return;
  const form = document.getElementById("form-add-particle");
  form.querySelector('[name="key"]').value = key;
  form.querySelector('[name="text"]').value = p.text || "";
  setTypeSelect(
    form.querySelector('select[name="ptype"]'),
    form.querySelector(".field-custom-type"),
    form.querySelector('input[name="ptypeCustom"]'),
    p.type
  );
  form.querySelector('[name="meaning"]').value = p.meaning || "";
  form.querySelector('[name="meanings"]').value = (p.meanings || []).join("\n");
  form.querySelector('[name="spellings"]').value = (p.spellings || []).join("\n");
  form.querySelector('[name="groups"]').value = (p.groups || []).join(" + ");
  form.querySelector('[name="category"]').value = p.category || "";
  form.querySelector('[name="notes"]').value = notesAsString(p.notes);
  form.querySelector('[name="key"]').dispatchEvent(new Event("blur"));
}

function fillWordForm(key) {
  const w = state.words[key];
  if (!w) return;
  const form = document.getElementById("form-add-word");
  form.querySelector('[name="key"]').value = key;
  form.querySelector('[name="word"]').value = w.word || "";
  setTypeSelect(
    form.querySelector('select[name="wtype"]'),
    form.querySelector(".field-custom-type"),
    form.querySelector('input[name="wtypeCustom"]'),
    w.type
  );
  form.querySelector('[name="meaning"]').value = w.meaning || "";
  form.querySelector('[name="particles"]').value = (w.particles || []).join(" + ");
  form.querySelector('[name="meanings"]').value = (w.meanings || []).join("\n");
  form.querySelector('[name="spellings"]').value = (w.spellings || []).join("\n");
  form.querySelector('[name="groups"]').value = (w.groups || []).join(" + ");
  form.querySelector('[name="category"]').value = w.category || "";
  form.querySelector('[name="notes"]').value = notesAsString(w.notes);
  form.querySelector('[name="key"]').dispatchEvent(new Event("blur"));
}

function fillPhraseForm(key) {
  const ph = state.phrases[key];
  if (!ph) return;
  const form = document.getElementById("form-add-phrase");
  form.querySelector('[name="key"]').value = key;
  form.querySelector('[name="phrase"]').value = ph.phrase || "";
  form.querySelector('[name="meaning"]').value = ph.meaning || "";
  form.querySelector('[name="words"]').value = (ph.words || []).join(" + ");
  form.querySelector('[name="meanings"]').value = (ph.meanings || []).join("\n");
  form.querySelector('[name="spellings"]').value = (ph.spellings || []).join("\n");
  form.querySelector('[name="groups"]').value = (ph.groups || []).join(" + ");
  form.querySelector('[name="category"]').value = ph.category || "";
  form.querySelector('[name="notes"]').value = notesAsString(ph.notes);
  form.querySelector('[name="key"]').dispatchEvent(new Event("blur"));
}

function wireEditButtons() {
  document.getElementById("edit-particle-btn").addEventListener("click", () => {
    if (!currentDetailKey.particle) return;
    fillParticleForm(currentDetailKey.particle);
    activatePanel("add-particle");
  });
  document.getElementById("edit-word-btn").addEventListener("click", () => {
    if (!currentDetailKey.word) return;
    fillWordForm(currentDetailKey.word);
    activatePanel("add-word");
  });
  document.getElementById("edit-phrase-btn").addEventListener("click", () => {
    if (!currentDetailKey.phrase) return;
    fillPhraseForm(currentDetailKey.phrase);
    activatePanel("add-phrase");
  });
}

/* --------------------------------------------------------------------- */
/* Type dropdowns (ptype / wtype)                                        */
/* --------------------------------------------------------------------- */

function populateTypeSelect(selectEl) {
  selectEl.innerHTML = "";
  GRAMMAR_TYPES.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t[0].toUpperCase() + t.slice(1);
    selectEl.appendChild(opt);
  });
  const other = document.createElement("option");
  other.value = "__other__";
  other.textContent = "Other…";
  selectEl.appendChild(other);
}

function wireTypeSelects() {
  document.querySelectorAll('select[name="ptype"], select[name="wtype"]').forEach((sel) => {
    populateTypeSelect(sel);
    sel.addEventListener("change", () => {
      const grid = sel.closest(".field-grid");
      const customField = grid.querySelector(".field-custom-type");
      const customInput = customField.querySelector("input");
      const showCustom = sel.value === "__other__";
      customField.hidden = !showCustom;
      customInput.required = showCustom;
    });
  });
}

function resolveType(sel, customInput) {
  return sel.value === "__other__" ? customInput.value.trim() : sel.value;
}

/* --------------------------------------------------------------------- */
/* Lookup forms                                                          */
/* --------------------------------------------------------------------- */

function wireLookupForms() {
  document.querySelectorAll(".lookup-form").forEach((form) => {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const kind = form.dataset.lookup;
      const key = new FormData(form).get("key").trim();
      if (kind === "particle") renderLookupParticle(key);
      if (kind === "word") renderLookupWord(key);
      if (kind === "phrase") renderLookupPhrase(key);
    });
  });
}

/* --------------------------------------------------------------------- */
/* Add forms                                                             */
/* --------------------------------------------------------------------- */

function splitLines(text) {
  return (text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parsePlusList(text) {
  return (text || "")
    .split("+")
    .map((s) => s.trim())
    .filter(Boolean);
}

/* Mirrors _create / _update in dictionary.py: a brand-new key is created
   as given; an existing key is merged, where a blank/empty field on the
   form keeps whatever was already on file for that field. */
function mergeOrCreate(store, key, newFields) {
  const existing = store[key];
  if (!existing) {
    store[key] = newFields;
    return { created: true };
  }
  const merged = { ...existing };
  for (const [field, value] of Object.entries(newFields)) {
    const isEmpty = value === "" || value === null || (Array.isArray(value) && value.length === 0);
    if (!isEmpty) merged[field] = value;
    else if (!(field in merged)) merged[field] = value;
  }
  store[key] = merged;
  return { created: false };
}

function showSaveStatus(form, message, isError) {
  const statusEl = form.querySelector("[data-save-status]");
  statusEl.textContent = message;
  statusEl.classList.toggle("error", !!isError);
}

function wireExistingCheck(form, storeName) {
  const keyInput = form.querySelector('input[name="key"]');
  const warningEl = form.querySelector(".existing-warning");
  keyInput.addEventListener("blur", () => {
    let key = keyInput.value.trim();
    if (storeName !== "phrases") key = stripDevoicing(key);
    const existing = key ? state[storeName][key] : null;
    if (!existing) {
      warningEl.hidden = true;
      return;
    }
    warningEl.hidden = false;
    warningEl.innerHTML = "";
    const label = storeName.slice(0, -1);
    warningEl.appendChild(
      el("p", { text: `A ${label} with this key already exists. Saving will update it — blank fields below keep their current value.` })
    );
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(existing, null, 2);
    warningEl.appendChild(pre);
  });
}

function wireAddParticleForm() {
  const form = document.getElementById("form-add-particle");
  wireExistingCheck(form, "particles");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const key = stripDevoicing(fd.get("key").trim());
    const text = stripDevoicing(fd.get("text").trim());
    const ptype = resolveType(form.querySelector('select[name="ptype"]'), form.querySelector('input[name="ptypeCustom"]'));
    const meaning = fd.get("meaning").trim();
    const meaningsExtra = splitLines(fd.get("meanings"));
    const spellingsExtra = splitLines(fd.get("spellings"));
    const groups = parsePlusList(fd.get("groups"));
    const category = fd.get("category").trim();
    const notes = fd.get("notes").trim();

    const newFields = { text, meaning, type: ptype, notes };
    if (meaningsExtra.length) newFields.meanings = meaningsExtra;
    if (spellingsExtra.length) newFields.spellings = spellingsExtra;
    if (groups.length) newFields.groups = groups;
    if (category) newFields.category = category;

    const { created } = mergeOrCreate(state.particles, key, newFields);
    saveStoreToCookies("particles");
    refreshDatalists();
    renderAllBrowseLists();
    showSaveStatus(form, created ? `Saved new particle ${keyDisplay(key)}.` : `Updated particle ${keyDisplay(key)}.`);
    form.querySelector(".existing-warning").hidden = true;
  });
}

function wireAddWordForm() {
  const form = document.getElementById("form-add-word");
  wireExistingCheck(form, "words");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const key = fd.get("key").trim(); // word keys keep their devoiced spelling, not stripped
    const word = fd.get("word").trim();
    const wtype = resolveType(form.querySelector('select[name="wtype"]'), form.querySelector('input[name="wtypeCustom"]'));
    const meaning = fd.get("meaning").trim();
    const particleKeys = parsePlusList(fd.get("particles")).map(stripDevoicing);
    const meaningsExtra = splitLines(fd.get("meanings"));
    const spellingsExtra = splitLines(fd.get("spellings"));
    const groups = parsePlusList(fd.get("groups"));
    const category = fd.get("category").trim();
    const notes = fd.get("notes").trim();

    const newFields = { word, meaning, type: wtype, particles: particleKeys, notes };
    if (meaningsExtra.length) newFields.meanings = meaningsExtra;
    if (spellingsExtra.length) newFields.spellings = spellingsExtra;
    if (groups.length) newFields.groups = groups;
    if (category) newFields.category = category;

    const { created } = mergeOrCreate(state.words, key, newFields);
    saveStoreToCookies("words");
    refreshDatalists();
    renderAllBrowseLists();
    showSaveStatus(form, created ? `Saved new word ${keyDisplay(key)}.` : `Updated word ${keyDisplay(key)}.`);
    form.querySelector(".existing-warning").hidden = true;
  });
}

function wireAddPhraseForm() {
  const form = document.getElementById("form-add-phrase");
  wireExistingCheck(form, "phrases");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const key = fd.get("key").trim();
    const phrase = fd.get("phrase").trim();
    const meaning = fd.get("meaning").trim();
    const wordsRaw = fd.get("words").trim();
    const wordKeys = wordsRaw ? parsePlusList(wordsRaw) : phrase.split(/\s+/).filter(Boolean);
    const meaningsExtra = splitLines(fd.get("meanings"));
    const spellingsExtra = splitLines(fd.get("spellings"));
    const groups = parsePlusList(fd.get("groups"));
    const category = fd.get("category").trim();
    const notes = fd.get("notes").trim();

    const newFields = { phrase, meaning, words: wordKeys, notes };
    if (meaningsExtra.length) newFields.meanings = meaningsExtra;
    if (spellingsExtra.length) newFields.spellings = spellingsExtra;
    if (groups.length) newFields.groups = groups;
    if (category) newFields.category = category;

    const { created } = mergeOrCreate(state.phrases, key, newFields);
    saveStoreToCookies("phrases");
    refreshDatalists();
    renderAllBrowseLists();
    showSaveStatus(form, created ? `Saved new phrase ${keyDisplay(key)}.` : `Updated phrase ${keyDisplay(key)}.`);
    form.querySelector(".existing-warning").hidden = true;
  });
}

/* --------------------------------------------------------------------- */
/* Publish to GitHub                                                     */
/* --------------------------------------------------------------------- */

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function githubRequest(path, token, options = {}) {
  const headers = Object.assign(
    { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    options.headers || {}
  );
  if (token) headers["Authorization"] = `token ${token}`;
  return fetch(API_BASE + path, { ...options, headers });
}

function logPublish(message, cls) {
  const log = document.getElementById("publishLog");
  const line = document.createElement("div");
  if (cls) line.className = cls;
  line.textContent = message;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

async function pushDictionary() {
  const branch = document.getElementById("branchName").value.trim();
  const token = document.getElementById("githubToken").value.trim();
  document.getElementById("publishLog").innerHTML = "";

  if (!branch) return logPublish("Enter a branch name first.", "err");
  if (!token) return logPublish("Enter a GitHub token first.", "err");

  if (branch === "main" || branch === "master") {
    if (!confirm(`You're about to push directly to "${branch}". Continue?`)) return;
  }

  const pushButton = document.getElementById("pushButton");
  pushButton.disabled = true;

  try {
    logPublish(`Looking up base branch "${GITHUB_BRANCH_DEFAULT}"…`);
    const refRes = await githubRequest(`/git/ref/heads/${GITHUB_BRANCH_DEFAULT}`, token);
    if (!refRes.ok) throw new Error(`Could not read base branch (${refRes.status}). Check your token's permissions.`);
    const baseSha = (await refRes.json()).object.sha;

    logPublish(`Ensuring branch "${branch}" exists…`);
    const createRes = await githubRequest("/git/refs", token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: baseSha }),
    });
    if (createRes.ok) {
      logPublish(`Created new branch "${branch}".`, "ok");
    } else if (createRes.status === 422) {
      logPublish(`Branch "${branch}" already exists — updating it.`);
    } else {
      const errBody = await createRes.json().catch(() => ({}));
      throw new Error(`Could not create branch (${createRes.status}): ${errBody.message || "unknown error"}`);
    }

    logPublish(`Reading current files on "${branch}"…`);
    const branchTree = await fetchGithubTree(branch);

    for (const storeName of Object.keys(GROUP_FOLDER)) {
      const shards = buildShards(storeName);

      // Category folders mean a store's files can sit at any depth (e.g.
      // Particles/Pronouns/foo.json), so stale-file detection needs the
      // whole subtree, not a single directory listing.
      const existingShas = new Map(pathsForStore(storeName, branchTree).map((entry) => [entry.path, entry.sha]));

      for (const [path, data] of shards.entries()) {
        logPublish(`Pushing ${path}…`);
        const putRes = await githubRequest(`/contents/${path}`, token, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `Update ${path} via Gayogo̱hó:nǫˀ web app`,
            content: utf8ToBase64(JSON.stringify(data, null, 2)),
            branch,
            ...(existingShas.has(path) ? { sha: existingShas.get(path) } : {}),
          }),
        });
        if (!putRes.ok) {
          const errBody = await putRes.json().catch(() => ({}));
          throw new Error(`Failed to push ${path} (${putRes.status}): ${errBody.message || "unknown error"}`);
        }
        logPublish(`✓ ${path} pushed.`, "ok");
        existingShas.delete(path);
      }

      // Anything left in existingShas is a group file from a previous publish
      // that no longer has any entries (its group was renamed, recategorized,
      // or emptied).
      for (const [path, sha] of existingShas.entries()) {
        logPublish(`Removing stale ${path}…`);
        const delRes = await githubRequest(`/contents/${path}`, token, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: `Remove stale ${path} via Gayogo̱hó:nǫˀ web app`, sha, branch }),
        });
        if (!delRes.ok) {
          const errBody = await delRes.json().catch(() => ({}));
          throw new Error(`Failed to remove ${path} (${delRes.status}): ${errBody.message || "unknown error"}`);
        }
        logPublish(`✓ ${path} removed.`, "ok");
      }
    }

    logPublish(`Done — branch "${branch}" is up to date.`, "ok");
  } catch (err) {
    console.error(err);
    logPublish(err.message, "err");
  } finally {
    pushButton.disabled = false;
  }
}

/* Branch name + token are remembered across visits via cookies, so this
   panel doesn't need to be refilled every time it's opened. */
function wirePublishPanelPersistence() {
  const branchInput = document.getElementById("branchName");
  const tokenInput = document.getElementById("githubToken");

  branchInput.value = getCookie("gyh_publish_branch") || "";
  tokenInput.value = getCookie("gyh_publish_token") || "";

  branchInput.addEventListener("input", () => setCookie("gyh_publish_branch", branchInput.value.trim()));
  tokenInput.addEventListener("input", () => setCookie("gyh_publish_token", tokenInput.value.trim()));
}

function wirePublishPanel() {
  document.getElementById("openPublish").addEventListener("click", () => {
    document.getElementById("publishOverlay").hidden = false;
  });
  document.getElementById("closePublish").addEventListener("click", () => {
    document.getElementById("publishOverlay").hidden = true;
  });
  document.getElementById("pushButton").addEventListener("click", pushDictionary);
  wirePublishPanelPersistence();
}

/* --------------------------------------------------------------------- */
/* Custom tooltips (data-tooltip="...") — more reliable than the native   */
/* title attribute, which has an inconsistent hover delay across browsers */
/* and doesn't work on touch at all.                                      */
/* --------------------------------------------------------------------- */

function initTooltips() {
  const tip = document.createElement("div");
  tip.className = "gyh-tooltip";
  tip.hidden = true;
  document.body.appendChild(tip);

  function positionTip(target) {
    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    let top = rect.top - tipRect.height - 8;
    if (top < 8) top = rect.bottom + 8; // flip below if there's no room above
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function showTip(target) {
    const text = target.dataset.tooltip;
    if (!text) return;
    tip.textContent = text;
    tip.hidden = false;
    positionTip(target);
  }

  function hideTip() {
    tip.hidden = true;
  }

  document.addEventListener("mouseover", (e) => {
    const target = e.target.closest("[data-tooltip]");
    if (target) showTip(target);
  });
  document.addEventListener("mouseout", (e) => {
    const target = e.target.closest("[data-tooltip]");
    if (target) hideTip();
  });
  // Tap-to-toggle so this also works on touch devices, which have no hover.
  document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-tooltip]");
    if (!target) return hideTip();
    if (tip.hidden) showTip(target);
    else hideTip();
  });
}

/* --------------------------------------------------------------------- */
/* Boot                                                                   */
/* --------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  wireTabs();
  wireTabDropdowns();
  wireTypeSelects();
  wireLookupForms();
  wireAddParticleForm();
  wireAddWordForm();
  wireAddPhraseForm();
  wireBrowseLinks();
  wireEditButtons();
  wirePublishPanel();
  wireRefreshButton();
  initTooltips();
  initApp();
});
