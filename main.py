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

#    # Stressed vowels (acute accent)
#    "a!": "á",

#    "?": "ˀ",
    
    # add_particle(key = "{en}h{en}:{?}", text = "{en}h{en}:{?}", meaning = "yes", ptype = "adverb")
    # add_word(key = "{en}h{en}:{?}", word = "{en}h{en}:{?}", meaning = "yes", wtype = "adverb", particle_keys = ["{en}h{en}:{?}"])
    # add_phrase(key = "{en}h{en}:{?} aknig{on-}ha{en}dea{?}s", phrase = "{en}h{en}:{?} aknig{on-}ha{en}dea{?}s", meaning = "Yes, {I, pronoun} understand.", word_keys = "")

    # add_particle(key = "t{en}{?} d{?}e", text = "t{en}{?} d{?}e", meaning = "no", ptype = "adverb")
    # add_word(key = "t{en}{?} d{?}e", word = "t{en}{?} d{?}e", meaning = "no", wtype = "adverb", particle_keys = ["t{en}{?} d{?}e"])
    # add_phrase(key = "t{en}{?} d{?}eaknig{on}ha{en}dea{?}s", phrase = "t{en}{?} d{?}eaknig{on}ha{en}dea{?}s", meaning = "No, {I, pronoun} don't understand.", word_keys = ["t{en}{?} d{?}e", "aknig{on}ha{en}dea{?}s"])


    
    # lookup_word() 
    # lookup_particle("sa")
    lookup_phrase("t{en}{?} d{?}eaknig{on}ha{en}dea{?}s")