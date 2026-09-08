import re


def translate_to_gayogohono(text: str) -> str:
    shorthands = {
        # Nasal vowels (ogonek)
        "an": "ą",
        "en": "ę",
        "on": "ǫ",

        # Whispered / devoiced vowels (macron below)
        "a-": "a̱",
        "e-": "e̱",
        "i-": "i̱",
        "o-": "o̱",
        "u-": "u̱",

        # Devoiced nasal vowels (ogonek + macron below)
        "an-": "ą̱",
        "en-": "ę̱",
        "on-": "ǫ̱",

        # Stressed vowels (acute accent)
        "a!": "á",
        "e!": "é",
        "i!": "í",
        "o!": "ó",
        "u!": "ú",

        # Stressed nasal vowels
        "an!": "ą́",
        "en!": "ę́",
        "on!": "ǫ́",

        "?": "ˀ",

        # Word-level shorthands — fill these in yourself
        #"Gayogohono": "Gayogo̱hó:nǫˀ",
        #"Nyawe": "Nyá:wę",
    }

    translated_text = text
    for shortcut, special_char in shorthands.items():
        translated_text = translated_text.replace("{" + shortcut + "}", special_char)

    return translated_text


def strip_devoicing(text: str) -> str:
    """
    Replace any devoiced-vowel shorthand token ({a-}, {e-}, ..., {an-},
    {en-}, {on-}) in `text` with its non-devoiced equivalent.

    Devoicing is a predictable feature of a vowel's position in the whole
    (surface) word, not something inherent to the particle it came from --
    so particles are always keyed/stored by their plain, non-devoiced
    vowel, and this is used to normalize them at save time.
    """
    devoicing = {
        "a-": "a",
        "e-": "e",
        "i-": "i",
        "o-": "o",
        "u-": "u",
        "an-": "{an}",
        "en-": "{en}",
        "on-": "{on}",
    }
    result = text
    for devoiced, plain in devoicing.items():
        result = result.replace("{" + devoiced + "}", plain)
    return result


def color_english_text(text: str) -> str:
    """
    Color-code English gloss text by grammatical type.

    Write `{word, type}` in a meaning/note/example string, e.g.:
        "How do {I, pronoun} say {and, conjunction}?"
    and this replaces each tag with `word`, colored the same way
    lookup_word()/lookup_particle() color that grammatical type (see
    TYPE_COLORS in dictionary.py) -- so an English gloss can visually
    match up with the particle color it's explaining.

    `word` is shown as typed by default, but the `shorthands` dict below
    lets you predefine what actually gets displayed for a given
    "word, type" tag -- fill these in yourself, e.g.:
        "me, pronoun": "I",
    would make {me, pronoun} display as "I" (colored as a pronoun).
    """
    # Imported here (not at module level) since dictionary.py imports
    # translate_to_gayogohono from this file -- importing dictionary at
    # the top of this file would create a circular import.
    from dictionary import color_for, RESET

    shorthands = {
        # "word, type": "text to display instead" -- fill these in yourself
        # "me, pronoun": "I",
    }

    def _replace(match: "re.Match") -> str:
        word = match.group(1).strip()
        wtype = match.group(2).strip()
        display = shorthands.get(f"{word}, {wtype}", word)
        return f"{color_for(wtype)}{display}{RESET}"

    return re.sub(r"\{([^{},]+),\s*([^{}]+)\}", _replace, text)


