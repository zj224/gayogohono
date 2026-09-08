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


