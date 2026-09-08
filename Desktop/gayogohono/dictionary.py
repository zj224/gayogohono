"""
Gayogo̱hó:nǫˀ (Cayuga) lexicon manager.

Stores three files:
    particles.json  -- individual particles (roots, affixes, etc.)
    words.json      -- full words, each referencing the particles it's built from
    phrases.json    -- multi-word phrases, each referencing the words it's built from

Lookup up a word and it prints the whole word AND its particle breakdown,
color-coded by grammatical type (pronoun = red, verb = blue, etc). Lookup up
a phrase and it prints the same way, one level up: each word in the phrase
shown with its own particles colored.
"""

import json
import os

from shorthands import translate_to_gayogohono

# ---------------------------------------------------------------------------
# File locations
# ---------------------------------------------------------------------------

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
PARTICLES_FILE = os.path.join(DATA_DIR, "particles.json")
WORDS_FILE = os.path.join(DATA_DIR, "words.json")
PHRASES_FILE = os.path.join(DATA_DIR, "phrases.json")

# ---------------------------------------------------------------------------
# Type -> color mapping
# "ansi" is used for terminal printing, "hex" is there if you ever build a
# GUI/web view and want the same color scheme.
# Add new types here as you need them.
# ---------------------------------------------------------------------------

TYPE_COLORS = {
    "pronoun":     {"ansi": "\033[91m", "hex": "#e74c3c"},  # red
    "verb":        {"ansi": "\033[94m", "hex": "#3498db"},  # blue
    "noun":        {"ansi": "\033[92m", "hex": "#2ecc71"},  # green
    "particle":    {"ansi": "\033[93m", "hex": "#f1c40f"},  # yellow
    "adjective":   {"ansi": "\033[95m", "hex": "#9b59b6"},  # purple
    "adverb":      {"ansi": "\033[96m", "hex": "#1abc9c"},  # teal
    "conjunction": {"ansi": "\033[90m", "hex": "#7f8c8d"},  # gray
    "unknown":     {"ansi": "\033[0m",  "hex": "#000000"},  # default/none
}
RESET = "\033[0m"


def color_for(word_type: str) -> str:
    """ANSI color code for a given type, falling back to 'unknown'."""
    return TYPE_COLORS.get(word_type, TYPE_COLORS["unknown"])["ansi"]


def colored_text(text: str, wtype: str) -> str:
    """
    Wrap `text` in the ANSI color for `wtype` (e.g. "noun", "pronoun"),
    falling back to the default color for an unrecognized type.

    Handy for hand-coloring a word inside an English gloss so it lines up
    with the color of the particle it corresponds to, e.g.:
        meaning = f"How do {colored_text('I', 'pronoun')} say ...?"
    """
    return f"{color_for(wtype)}{text}{RESET}"


# ---------------------------------------------------------------------------
# Load / save
# ---------------------------------------------------------------------------

def _load_json(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_json(path: str, data: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)


def load_particles() -> dict:
    return _load_json(PARTICLES_FILE)


def save_particles(particles: dict) -> None:
    _save_json(PARTICLES_FILE, particles)


def load_words() -> dict:
    return _load_json(WORDS_FILE)


def save_words(words: dict) -> None:
    _save_json(WORDS_FILE, words)


def load_phrases() -> dict:
    return _load_json(PHRASES_FILE)


def save_phrases(phrases: dict) -> None:
    _save_json(PHRASES_FILE, phrases)


# ---------------------------------------------------------------------------
# Adding entries
# ---------------------------------------------------------------------------

def _print_entry(label: str, entry: dict) -> None:
    print(f"{label}:")
    print(json.dumps(entry, ensure_ascii=False, indent=2))


def _key_display(key: str) -> str:
    """
    Quote a key for a message, appending its Gayogo̱hó:nǫˀ spelling when
    the key itself is shorthand-encoded text (e.g. a phrase key, which is
    the phrase's own wording) -- a no-op for a plain mnemonic id.
    """
    translated = translate_to_gayogohono(key)
    if translated != key:
        return f"'{key}' ({translated})"
    return f"'{key}'"


def _already_exists(store: dict, key: str, label: str, update_hint: str) -> bool:
    """
    If `key` is already in `store`, print what's currently on file for it
    and point at the update function instead of silently overwriting.
    """
    if key not in store:
        return False
    print(f"{label} {_key_display(key)} already exists:")
    print(json.dumps(store[key], ensure_ascii=False, indent=2))
    print(f"Use {update_hint} to change a field on it.")
    return True


def _not_found(store: dict, key: str, label: str, add_hint: str) -> bool:
    """If `key` isn't in `store`, print that it needs to be added first."""
    if key in store:
        return False
    print(f"No {label} found for {_key_display(key)} -- use {add_hint} to create it first.")
    return True


def _create(store: dict, key: str, new_fields: dict) -> dict:
    """Add a brand-new entry under `key` (caller must have checked it doesn't exist)."""
    store[key] = new_fields
    _print_entry(f"Added new entry for {_key_display(key)}", new_fields)
    return store


def _update(store: dict, key: str, new_fields: dict) -> dict:
    """
    Merge `new_fields` into the existing entry at `key` (caller must have
    checked it exists). Any field left empty ("", [], or None) in
    `new_fields` falls back to the existing value for that field. Prints
    the entry before and after so a bad update can be spotted and
    corrected by re-running it.
    """
    old = store[key]

    merged = dict(old)
    for field, value in new_fields.items():
        if value not in (None, "", []):
            merged[field] = value
        elif field not in merged:
            merged[field] = value

    _print_entry(f"Existing entry for {_key_display(key)} (before update)", old)
    _print_entry(f"Updated entry for {_key_display(key)} (after update)", merged)

    store[key] = merged
    return store


def _split_meaning(meaning) -> tuple:
    """
    Accept `meaning` as either a plain string (one gloss) or a list/tuple
    of glosses. Returns (primary, extras): the first gloss is primary,
    any rest are additional senses to merge into "meanings".
    """
    if isinstance(meaning, (list, tuple)):
        items = [m for m in meaning if m]
        if not items:
            return "", []
        return items[0], items[1:]
    return meaning, []


def add_particle(key: str, text: str, meaning, ptype: str, notes: str = "",
                  particles: dict = None, autosave: bool = True) -> dict:
    """
    Add a new particle.
        key      -- short lookup id, e.g. "gayogo"
        text     -- the particle as written, e.g. "gayogo̱-"
        meaning  -- gloss/definition; a string for one sense, or a list of
                    strings for several (the first becomes the primary
                    "meaning", the rest are added to "meanings")
        ptype    -- grammatical type, e.g. "noun", "verb", "pronoun" ...
        notes    -- free-form notes, e.g. usage caveats, variants, sources

    If `key` already exists, this refuses to overwrite it -- it prints
    what's currently on file and tells you to use update_particle() instead.
    """
    if particles is None:
        particles = load_particles()

    if _already_exists(particles, key, "Particle", "update_particle()"):
        return particles

    primary, extras = _split_meaning(meaning)
    new_fields = {
        "text": text,
        "meaning": primary,
        "type": ptype,
        "notes": notes,
    }
    if extras:
        new_fields["meanings"] = extras

    particles = _create(particles, key, new_fields)

    if autosave:
        save_particles(particles)
    return particles


def update_particle(key: str, text: str = "", meaning="", ptype: str = "", notes: str = "",
                     particles: dict = None, autosave: bool = True) -> dict:
    """
    Update an existing particle in place. Leave any argument at its
    default ("") to keep the value already on file for that field.
        meaning  -- a string to replace the primary meaning, or a list of
                    strings to replace the primary meaning AND "meanings"
                    entirely (not merged with what was there before)

    If `key` doesn't exist yet, this tells you to use add_particle() instead.
    """
    if particles is None:
        particles = load_particles()

    if _not_found(particles, key, "particle", "add_particle()"):
        return particles

    primary, extras = _split_meaning(meaning)
    new_fields = {
        "text": text,
        "meaning": primary,
        "type": ptype,
        "notes": notes,
    }
    if extras:
        new_fields["meanings"] = extras

    particles = _update(particles, key, new_fields)

    if autosave:
        save_particles(particles)
    return particles


def add_word(key: str, word: str, meaning, wtype: str,
             particle_keys: list, notes: str = "",
             words: dict = None, autosave: bool = True) -> dict:
    """
    Add a new word.
        key            -- short lookup id, e.g. "gayogohono"
        word           -- the full word as written, e.g. "Gayogo̱hó:nǫˀ"
        meaning        -- gloss/definition; a string for one sense, or a
                          list of strings for several (the first becomes
                          the primary "meaning", the rest are added to
                          "meanings")
        wtype          -- grammatical type of the whole word
        particle_keys  -- list of particle keys (must exist in particles.json)
                          in the order they combine to form the word
        notes          -- free-form notes, e.g. usage caveats, variants, sources

    If `key` already exists, this refuses to overwrite it -- it prints
    what's currently on file and tells you to use update_word() instead.
    """
    if words is None:
        words = load_words()

    if _already_exists(words, key, "Word", "update_word()"):
        return words

    primary, extras = _split_meaning(meaning)
    new_fields = {
        "word": word,
        "meaning": primary,
        "type": wtype,
        "particles": particle_keys,
        "notes": notes,
    }
    if extras:
        new_fields["meanings"] = extras

    words = _create(words, key, new_fields)

    if autosave:
        save_words(words)
    return words


def update_word(key: str, word: str = "", meaning="", wtype: str = "",
                 particle_keys: list = None, notes: str = "",
                 words: dict = None, autosave: bool = True) -> dict:
    """
    Update an existing word in place. Leave any argument at its default
    ("" / []) to keep the value already on file for that field.
        meaning  -- a string to replace the primary meaning, or a list of
                    strings to replace the primary meaning AND "meanings"
                    entirely (not merged with what was there before)

    If `key` doesn't exist yet, this tells you to use add_word() instead.
    """
    if words is None:
        words = load_words()
    if particle_keys is None:
        particle_keys = []

    if _not_found(words, key, "word", "add_word()"):
        return words

    primary, extras = _split_meaning(meaning)
    new_fields = {
        "word": word,
        "meaning": primary,
        "type": wtype,
        "particles": particle_keys,
        "notes": notes,
    }
    if extras:
        new_fields["meanings"] = extras

    words = _update(words, key, new_fields)

    if autosave:
        save_words(words)
    return words


def add_phrase(key: str, phrase: str, meaning, word_keys: list, notes: str = "",
               phrases: dict = None, autosave: bool = True) -> dict:
    """
    Add a new phrase.
        key        -- short lookup id, e.g. "my_language"
        phrase     -- the full phrase as written, e.g. "Sge:nǫˀ, gayogo̱hó:nǫˀ"
        meaning    -- gloss/definition; a string for one sense, or a list
                      of strings for several (the first becomes the
                      primary "meaning", the rest are added to "meanings")
        word_keys  -- list of word keys (must exist in words.json) in the
                      order they combine to form the phrase
        notes      -- free-form notes, e.g. usage caveats, variants, sources

    Unlike a word, a phrase has no grammatical type of its own -- it's
    just a sequence of words. If `key` already exists, this refuses to
    overwrite it -- it prints what's currently on file and tells you to
    use update_phrase() instead.
    """
    if phrases is None:
        phrases = load_phrases()

    if _already_exists(phrases, key, "Phrase", "update_phrase()"):
        return phrases

    primary, extras = _split_meaning(meaning)
    new_fields = {
        "phrase": phrase,
        "meaning": primary,
        "words": word_keys,
        "notes": notes,
    }
    if extras:
        new_fields["meanings"] = extras

    phrases = _create(phrases, key, new_fields)

    if autosave:
        save_phrases(phrases)
    return phrases


def update_phrase(key: str, phrase: str = "", meaning="", word_keys: list = None,
                   notes: str = "", phrases: dict = None, autosave: bool = True) -> dict:
    """
    Update an existing phrase in place. Leave any argument at its default
    ("" / []) to keep the value already on file for that field.
        meaning  -- a string to replace the primary meaning, or a list of
                    strings to replace the primary meaning AND "meanings"
                    entirely (not merged with what was there before)

    If `key` doesn't exist yet, this tells you to use add_phrase() instead.
    """
    if phrases is None:
        phrases = load_phrases()
    if word_keys is None:
        word_keys = []

    if _not_found(phrases, key, "phrase", "add_phrase()"):
        return phrases

    primary, extras = _split_meaning(meaning)
    new_fields = {
        "phrase": phrase,
        "meaning": primary,
        "words": word_keys,
        "notes": notes,
    }
    if extras:
        new_fields["meanings"] = extras

    phrases = _update(phrases, key, new_fields)

    if autosave:
        save_phrases(phrases)
    return phrases


def _append_to_list(store: dict, key: str, field: str, item: str,
                     kind: str, primary_field: str = None) -> dict:
    """
    Append `item` to entry[field] (creating the list if needed), without
    touching any other field. Skips exact duplicates, including a value
    that already matches `primary_field` (e.g. no point repeating the
    primary meaning in the extra-meanings list).
    """
    entry = store.get(key)
    if entry is None:
        print(f"No {kind} found for {_key_display(key)} -- add it first")
        return store

    old = dict(entry)
    lst = entry.setdefault(field, [])
    if item not in lst and (primary_field is None or item != entry.get(primary_field)):
        lst.append(item)

    _print_entry(f"Existing entry for {_key_display(key)} (before update)", old)
    _print_entry(f"Updated entry for {_key_display(key)} (after update)", entry)
    return store


def add_meaning_particle(key: str, meaning: str, particles: dict = None, autosave: bool = True) -> dict:
    """
    Add an additional meaning/sense to an existing particle, without
    touching its text, type, notes, or examples. The original `meaning`
    stays primary; extra ones accumulate in `meanings`.
    """
    if particles is None:
        particles = load_particles()

    particles = _append_to_list(particles, key, "meanings", meaning,
                                 kind="particle", primary_field="meaning")

    if autosave and key in particles:
        save_particles(particles)
    return particles


def add_meaning_word(key: str, meaning: str, words: dict = None, autosave: bool = True) -> dict:
    """
    Add an additional meaning/sense to an existing word, without touching
    its spelling, type, particles, notes, or examples. The original
    `meaning` stays the primary gloss; extra ones accumulate in `meanings`.
    """
    if words is None:
        words = load_words()

    words = _append_to_list(words, key, "meanings", meaning,
                             kind="word", primary_field="meaning")

    if autosave and key in words:
        save_words(words)
    return words


def add_example_particle(key: str, example: str, particles: dict = None, autosave: bool = True) -> dict:
    """
    Add an additional usage example to an existing particle. Examples
    accumulate in `examples`, so you can attach as many as you like.
    """
    if particles is None:
        particles = load_particles()

    particles = _append_to_list(particles, key, "examples", example, kind="particle")

    if autosave and key in particles:
        save_particles(particles)
    return particles


def add_example_word(key: str, example: str, words: dict = None, autosave: bool = True) -> dict:
    """
    Add an additional usage example to an existing word. Examples
    accumulate in `examples`, so you can attach as many as you like.
    """
    if words is None:
        words = load_words()

    words = _append_to_list(words, key, "examples", example, kind="word")

    if autosave and key in words:
        save_words(words)
    return words


def add_meaning_phrase(key: str, meaning: str, phrases: dict = None, autosave: bool = True) -> dict:
    """
    Add an additional meaning/sense to an existing phrase, without
    touching its wording, words, notes, or examples. The original
    `meaning` stays primary; extra ones accumulate in `meanings`.
    """
    if phrases is None:
        phrases = load_phrases()

    phrases = _append_to_list(phrases, key, "meanings", meaning,
                               kind="phrase", primary_field="meaning")

    if autosave and key in phrases:
        save_phrases(phrases)
    return phrases


def add_example_phrase(key: str, example: str, phrases: dict = None, autosave: bool = True) -> dict:
    """
    Add an additional usage example to an existing phrase. Examples
    accumulate in `examples`, so you can attach as many as you like.
    """
    if phrases is None:
        phrases = load_phrases()

    phrases = _append_to_list(phrases, key, "examples", example, kind="phrase")

    if autosave and key in phrases:
        save_phrases(phrases)
    return phrases


# ---------------------------------------------------------------------------
# Lookup / display
# ---------------------------------------------------------------------------

def _colored_particles_text(particle_keys: list, particles: dict) -> tuple:
    """
    Build the type-colored concatenation of a list of particle keys, plus
    a parallel list of "text (type: meaning)" pieces for a breakdown line.
    A particle key that isn't in `particles` renders in the default color
    in the concatenation, and as "__ (missing particle: key)" in pieces.
    """
    colored = ""
    pieces = []
    for pkey in particle_keys:
        p = particles.get(pkey)
        if p is None:
            unknown = color_for("unknown")
            colored += f"{unknown}{translate_to_gayogohono(pkey)}{RESET}"
            pieces.append(f"__ (missing particle: {pkey})")
            continue
        c = color_for(p["type"])
        text = translate_to_gayogohono(p["text"])
        colored += f"{c}{text}{RESET}"
        pieces.append(f"{c}{text}{RESET} ({p['type']}: {p['meaning']})")
    return colored, pieces


def _colored_word_text(word_key: str, particles: dict, words: dict) -> str:
    """
    Build the type-colored rendering of a whole word (by its particles),
    for use in a phrase's top display line. A word key that isn't in
    `words` renders in the default color.
    """
    entry = words.get(word_key)
    if entry is None:
        unknown = color_for("unknown")
        return f"{unknown}{translate_to_gayogohono(word_key)}{RESET}"

    particle_keys = entry.get("particles", [])
    if not particle_keys:
        c = color_for(entry["type"])
        return f"{c}{translate_to_gayogohono(entry['word'])}{RESET}"

    colored, _ = _colored_particles_text(particle_keys, particles)
    return colored


def lookup_word(key: str, particles: dict = None, words: dict = None) -> None:
    """
    Print a word's meaning plus its color-coded particle breakdown.

    The main display line is built by concatenating each particle's text in
    its own type-color (pronoun particle red, verb particle blue, etc), so
    the word itself shows which stretch of letters came from which particle.
    The canonical spelling from words.json is shown underneath as a
    reference, in case fusion/spelling changes mean the particles don't
    concatenate back to it exactly.
    """
    if particles is None:
        particles = load_particles()
    if words is None:
        words = load_words()

    entry = words.get(key)
    if entry is None:
        print(f"No word found for {_key_display(key)}")
        return

    particle_keys = entry.get("particles", [])

    if not particle_keys:
        # No particle breakdown available -- fall back to word-type color
        c = color_for(entry["type"])
        print(f"{c}{translate_to_gayogohono(entry['word'])}{RESET}")
        print(f"  meaning: {entry['meaning']}")
        if entry.get("meanings"):
            print("  also: " + "; ".join(entry["meanings"]))
        if entry.get("notes"):
            print(f"  notes: {entry['notes']}")
        if entry.get("examples"):
            print("  examples:")
            for ex in entry["examples"]:
                print(f"    - {translate_to_gayogohono(ex)}")
        return

    colored_word, pieces = _colored_particles_text(particle_keys, particles)

    print(colored_word)
    #print(f"  spelled: {translate_to_gayogohono(entry['word'])}  ({entry['type']})")
    print(f"  meaning: {entry['meaning']}")
    if entry.get("meanings"):
        print("  also: " + "; ".join(entry["meanings"]))
    print("  made of: " + " + ".join(pieces))
    if entry.get("notes"):
        print(f"  notes: {entry['notes']}")
    if entry.get("examples"):
        print("  examples:")
        for ex in entry["examples"]:
            print(f"    - {translate_to_gayogohono(ex)}")


def lookup_particle(key: str, particles: dict = None) -> None:
    """
    Print a single particle's text (color-coded by type), meaning, and notes.
    """
    if particles is None:
        particles = load_particles()

    p = particles.get(key)
    if p is None:
        print(f"No particle found for {_key_display(key)}")
        return

    c = color_for(p["type"])
    print(f"{c}{translate_to_gayogohono(p['text'])}{RESET}")
    print(f"  type: {p['type']}")
    print(f"  meaning: {p['meaning']}")
    if p.get("meanings"):
        print("  also: " + "; ".join(p["meanings"]))
    if p.get("notes"):
        print(f"  notes: {p['notes']}")
    if p.get("examples"):
        print("  examples:")
        for ex in p["examples"]:
            print(f"    - {translate_to_gayogohono(ex)}")


def lookup_phrase(key: str, particles: dict = None, words: dict = None, phrases: dict = None) -> None:
    """
    Print a phrase's meaning plus its word-by-word breakdown.

    The main display line concatenates each word in the phrase, and each
    word is itself rendered with its particles colored by type -- same as
    lookup_word, just one level up. A word key that isn't in words.json
    renders in the default color; a phrase key that isn't in phrases.json
    just prints a "not found" message.
    """
    if particles is None:
        particles = load_particles()
    if words is None:
        words = load_words()
    if phrases is None:
        phrases = load_phrases()

    entry = phrases.get(key)
    if entry is None:
        print(f"No phrase found for {_key_display(key)}")
        return

    word_keys = entry.get("words", [])

    if not word_keys:
        print(translate_to_gayogohono(entry["phrase"]))
        print(f"  meaning: {entry['meaning']}")
        if entry.get("meanings"):
            print("  also: " + "; ".join(entry["meanings"]))
        if entry.get("notes"):
            print(f"  notes: {entry['notes']}")
        if entry.get("examples"):
            print("  examples:")
            for ex in entry["examples"]:
                print(f"    - {translate_to_gayogohono(ex)}")
        return

    colored_pieces = []
    breakdown_pieces = []
    for wkey in word_keys:
        rendered = _colored_word_text(wkey, particles, words)
        colored_pieces.append(rendered)
        w = words.get(wkey)
        if w is None:
            breakdown_pieces.append(f"{rendered} (missing word: {wkey})")
        else:
            breakdown_pieces.append(f"{rendered} ({w['meaning']})")

    print(" ".join(colored_pieces))
    print(f"  spelled: {translate_to_gayogohono(entry['phrase'])}")
    print(f"  meaning: {entry['meaning']}")
    if entry.get("meanings"):
        print("  also: " + "; ".join(entry["meanings"]))
    print("  made of: " + " + ".join(breakdown_pieces))
    if entry.get("notes"):
        print(f"  notes: {entry['notes']}")
    if entry.get("examples"):
        print("  examples:")
        for ex in entry["examples"]:
            print(f"    - {translate_to_gayogohono(ex)}")

