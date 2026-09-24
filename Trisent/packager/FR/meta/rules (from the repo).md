---
type: packager-rules
language: fr
---

<!-- Wie aus einer Wortform ein Wissensschlüssel wird.
     Aus dem Trisent-Repo geholt.
     Ändere hier, was dir fehlt - diese Notiz gilt, nicht das Repo. -->

# House rules: FR

Decisions that hold for **every** French text. They keep the knowledge
keys together: only if the same word form always gets the same base form
and part of speech does a word learned once still count in the next text.

Glosses and translations are written in **German**.

This list grows. Whatever had to be decided while preparing a text and is
not written here yet belongs here.

## Base forms

1. Verbs carry the **infinitive**: `est` → `être`, `voit` → `voir`,
   `voudrais` → `vouloir`.
2. `être` is always **AUX**, `avoir` always **VERB**. Asymmetric, but
   settled - keep to it.
3. Names: base form as written (`Thomas`, `Paris`), the gloss is the name.
4. Plural shares the key with the singular: `nuits` → `fr:nuit:NOUN`.
5. Feminine forms share the key with the masculine: `amie` and `ami` both
   give `fr:ami:NOUN`; the gloss shows which one it is.
6. Determiners and pronouns take the base form of their own series, never
   the noun beside them: `ses` → `son`, `ma` → `mon`.

## Where French pulls words together

7. **Elisions are words of their own**, with the full base form:
   `j'`→`je`, `l'`→`le`, `c'`→`ce`, `s'`→`si`, `m'`→`me`, `d'`→`de`,
   `qu'`→`que`, `n'`→`ne`.
8. **Contractions stay one word**, and the gloss opens them up:
   `du` → "of the", `au` → "to the", `des`, `aux`.
9. The **partitive is not contracted**: `de la musique` is `de` + `la`.
   Otherwise `du` and `de la` would be treated differently.

## Glossing

10. Articles follow the **French** gender, not the reader's:
    `la fête` → "the(f) celebration". That is the point of the layer.
11. Where a single word does not exist, hyphenate: `bonjour` →
    "good-day". Never two words with a space.
12. The gloss in a sentence may be narrower than the one in the
    dictionary: `à` is "to, in, at, until" there, one of them here.

## Parts of speech

13. `voici` and `voilà` are **PART**.
14. Numerals are **NUM**; hyphenated compounds become a phrase:
    `quatre-vingts`.

## Phrases

15. Polite formulas, grammatical constructions, fixed terms - not
    ordinary word sequences. When in doubt, leave it out.

    Known so far: `il y a` · `est-ce que` · `c'est ça` · `je voudrais` ·
    `je m'appelle` · `s'il vous plaît` · `je vous en prie` · `d'accord` ·
    `bon séjour` · `mot de passe` · `petit déjeuner` · `à droite` ·
    `à quelle heure` · `quatre-vingts`

16. The base form of a phrase is the **citation form**: lower case,
    straight apostrophe. `Je m'appelle` at the start of a sentence still
    gives `je m'appelle`.

## Spelling

17. Base forms always use the straight apostrophe `'`. The original text
    keeps whatever it has and is never smoothed.

---

What belongs in a word's description is not decided here - see the recipe
in `word-notes.md`.
