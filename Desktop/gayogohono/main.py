from dictionary import *



# ---------------------------------------------------------------------------
# Example usage -- replace with your own data / delete once you're building
# these files for real
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    particles = load_particles()
    words = load_words()
#   # Nasal vowels (ogonek)
#    "an": "ą",
#    "en": "ę",
#    "on": "ǫ",

#    # Whispered / devoiced vowels (macron below)
#    "a-": "a̱",
#    "e-": "e̱",
#    "i-": "i̱",
#    "o-": "o̱",
#    "u-": "u̱",

#    # Stressed vowels (acute accent)
#    "a!": "á",
#    "e!": "é",
#    "i!": "í",
#    "o!": "ó",
#    "u!": "ú",

#    # Stressed nasal vowels
#    "an!": "ą́",
#    "en!": "ę́",
#    "on!": "ǫ́",

#    "?": "ˀ",
    
    #add_particle(key = "", text = "", meaning = "", ptype = "")
    
    #add_word(key = "", word = "", meaning = "", wtype = "", particle_keys = None)


    
    #lookup_word() 
    #lookup_particle()
    lookup_phrase("d{en}{?}ho{?}d{en}{?} {en}:gi{?} ne{?}")