"use strict";

/* =========================================================================
   Gayogo̱hó:nǫˀ Lexicon — front end
   Ports the coloring/shorthand logic from shorthands.py + dictionary.py to
   the browser, stores the working dictionary in cookies, and can push
   particles.json / words.json / phrases.json to a branch on GitHub.
   ========================================================================= */

const GITHUB_OWNER = "zj224";
const GITHUB_REPO = "gayogohono";
const GITHUB_BRANCH_DEFAULT = "main";
const RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH_DEFAULT}/`;
const API_BASE = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

const STORE_FILES = { particles: "particles.json", words: "words.json", phrases: "phrases.json" };

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
      frag.appendChild(coloredSpan(translateToGayogohono(pkey), "unknown"));
      continue;
    }
    frag.appendChild(coloredSpan(translateToGayogohono(p.text), p.type));
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

function renderLookupParticle(key) {
  const container = document.getElementById("result-lookup-particle");
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
  appendNotesAndExamples(container, p);
}

function renderLookupWord(key) {
  const container = document.getElementById("result-lookup-word");
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

  if (particleKeys.length) {
    const madeOfLine = el("div", { class: "result-line" });
    madeOfLine.append("made of: ");
    appendJoined(madeOfLine, buildParticleBreakdownPieces(particleKeys, true), " + ");
    container.appendChild(madeOfLine);
  }

  appendNotesAndExamples(container, w);
}

function renderLookupPhrase(key) {
  const container = document.getElementById("result-lookup-phrase");
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

async function fetchStoreFromGithub(storeName) {
  const res = await fetch(RAW_BASE + STORE_FILES[storeName], { cache: "no-store" });
  if (!res.ok) throw new Error(`GitHub fetch failed for ${STORE_FILES[storeName]}: ${res.status}`);
  return res.json();
}

function setSyncStatus(kind, text) {
  document.getElementById("syncDot").className = `dot ${kind}`;
  document.getElementById("syncText").textContent = text;
}

async function initApp() {
  setSyncStatus("", "loading…");

  const missing = [];
  for (const storeName of Object.keys(STORE_FILES)) {
    const fromCookie = loadStoreFromCookies(storeName);
    if (fromCookie) state[storeName] = fromCookie;
    else missing.push(storeName);
  }

  if (missing.length === 0) {
    setSyncStatus("ok", "loaded from this browser");
  } else {
    try {
      await Promise.all(
        missing.map(async (storeName) => {
          state[storeName] = await fetchStoreFromGithub(storeName);
          saveStoreToCookies(storeName);
        })
      );
      setSyncStatus("ok", missing.length === 3 ? "loaded from GitHub" : "loaded from GitHub + this browser");
    } catch (err) {
      console.error(err);
      setSyncStatus("warn", "could not reach GitHub — starting empty");
    }
  }

  refreshDatalists();
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

function refreshDatalists() {
  fillDatalist("particleKeysList", Object.keys(state.particles));
  fillDatalist("wordKeysList", Object.keys(state.words));
  fillDatalist("phraseKeysList", Object.keys(state.phrases));
}

/* --------------------------------------------------------------------- */
/* Tabs                                                                   */
/* --------------------------------------------------------------------- */

function wireTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll("[data-panel]").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
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
    const notes = fd.get("notes").trim();

    const newFields = { text, meaning, type: ptype, notes };
    if (meaningsExtra.length) newFields.meanings = meaningsExtra;

    const { created } = mergeOrCreate(state.particles, key, newFields);
    saveStoreToCookies("particles");
    refreshDatalists();
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
    const notes = fd.get("notes").trim();

    const newFields = { word, meaning, type: wtype, particles: particleKeys, notes };
    if (meaningsExtra.length) newFields.meanings = meaningsExtra;

    const { created } = mergeOrCreate(state.words, key, newFields);
    saveStoreToCookies("words");
    refreshDatalists();
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
    const notes = fd.get("notes").trim();

    const newFields = { phrase, meaning, words: wordKeys, notes };
    if (meaningsExtra.length) newFields.meanings = meaningsExtra;

    const { created } = mergeOrCreate(state.phrases, key, newFields);
    saveStoreToCookies("phrases");
    refreshDatalists();
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

    for (const [storeName, filename] of Object.entries(STORE_FILES)) {
      logPublish(`Pushing ${filename}…`);
      let sha = null;
      const contentsRes = await githubRequest(`/contents/${filename}?ref=${encodeURIComponent(branch)}`, token);
      if (contentsRes.ok) {
        sha = (await contentsRes.json()).sha;
      } else if (contentsRes.status !== 404) {
        throw new Error(`Could not read current ${filename} on branch (${contentsRes.status}).`);
      }

      const putRes = await githubRequest(`/contents/${filename}`, token, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Update ${filename} via Gayogo̱hó:nǫˀ web app`,
          content: utf8ToBase64(JSON.stringify(state[storeName], null, 2)),
          branch,
          ...(sha ? { sha } : {}),
        }),
      });
      if (!putRes.ok) {
        const errBody = await putRes.json().catch(() => ({}));
        throw new Error(`Failed to push ${filename} (${putRes.status}): ${errBody.message || "unknown error"}`);
      }
      logPublish(`✓ ${filename} pushed.`, "ok");
    }

    logPublish(`Done — branch "${branch}" is up to date.`, "ok");
  } catch (err) {
    console.error(err);
    logPublish(err.message, "err");
  } finally {
    pushButton.disabled = false;
  }
}

function wirePublishPanel() {
  document.getElementById("openPublish").addEventListener("click", () => {
    document.getElementById("publishOverlay").hidden = false;
  });
  document.getElementById("closePublish").addEventListener("click", () => {
    document.getElementById("publishOverlay").hidden = true;
  });
  document.getElementById("pushButton").addEventListener("click", pushDictionary);
}

/* --------------------------------------------------------------------- */
/* Boot                                                                   */
/* --------------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
  wireTabs();
  wireTypeSelects();
  wireLookupForms();
  wireAddParticleForm();
  wireAddWordForm();
  wireAddPhraseForm();
  wirePublishPanel();
  initApp();
});
