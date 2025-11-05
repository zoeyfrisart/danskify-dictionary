# @danskify/dictionary

## About

This package was created by the Danskify project [https://danskify.com](https://danskify.com) as part of an open-data initiative to provide accessible English–Danish vocabulary resources.

It converts and repackages the Wiktionary dataset originally compiled by  
[Matthias Buchmeier](https://en.wiktionary.org/wiki/User:Matthias_Buchmeier) and contributors into a JSON format suitable for modern web applications.

## Data processing and enhancements

This dataset is **not a raw copy** of the original Wiktionary export. The source English–Danish dictionary compiled by [Matthias Buchmeier](https://en.wiktionary.org/wiki/User:Matthias_Buchmeier) and other Wiktionary contributors was used as a starting point and then **significantly refined** by the Danskify project.

Processing steps include:

- **Data cleaning**: removing malformed, duplicate, or incomplete entries.
- **Quality filtering**: dropping low-confidence translations based on semantic similarity using `Xenova/distiluse-base-multilingual-cased-v2`.
- **Category pruning**: excluding entries classified as _article_, _interjection_, _abbreviation_, _prefix_, _suffix_, and _proverb_.
- **Toxicity screening**: run `Xenova/toxic-bert` locally to remove offensive or unsafe entries (slurs, profanity, explicit, or violent content).
- **AI audit**: uses `gpt-5` with a strict whitelist prompt to double-check borderline entries.
- **Normalization**: converting data from .txt to JSON, standardizing field names, and adding optional metadata (e.g., `wordCount`, `form`).

As a result, this dataset represents a **curated derivative work** of the Wiktionary material, not an official subset or mirror.

## Regenerating the dataset

To rebuild the dataset from the original text source:

1. Parse and normalize

```bash
yarn parse
```

This generates the `src/data.json` and `validations/data-originals.json` files.

2. Run semantic validation

```bash
yarn generate:validation && yarn validate:sample
```

Filters by embedding similarity; logs average and flagged entries (this is an additional set of data validation for possible incorrect entries).

3. Run toxicity filter

```bash
yarn clean
```

→ produces
data/data-clean.json and data/data-removed.json logs counts and top 30 borderline removals. It will also generate a `data/data-review.json` file which contains words that were not removed but were close to being removed.

It's good practice to review this file for entries that might need to be removed from the final output.

Afterwards this command will proceed to automatically review the removed entries with `gpt-5`. We'd expect around 50 entries to be restored back from the `data-removed.json`. These will be output in `data-restored.json`, manually review these entries if they are indeed safe copy and paste them over to data-clean.

When publishing to NPM it will automatically copy over the data-clean.json into the src folder.

Publish via npm once validated.

## License and Provenance

Data derived from:  
**English–Danish Wiktionary dataset**  
Compiled by [User: Matthias Buchmeier](https://en.wiktionary.org/wiki/User:Matthias_Buchmeier) and contributors  
Version 20200401

Licensed under the [Creative Commons Attribution–ShareAlike 3.0 Unported License (CC BY-SA 3.0)](https://creativecommons.org/licenses/by-sa/3.0/).

© 2002–2020 Wiktionary contributors  
© 2025 Danskify contributors (data cleaning, filtering, and JSON conversion)

This dataset was **heavily curated and transformed** from the original Wiktionary export. See the **Data processing and enhancements** section above for details on data processing and curation. These modifications aim to improve translation quality and consistency while preserving the open-data spirit of the original work.

This derivative dataset is distributed under the same CC BY-SA 3.0 license.

This package was created for and is used by [Danskify.com](https://danskify.com).
No endorsement by Wiktionary or the Wikimedia Foundation is implied.

## License selection

The original Wiktionary dataset was dual-licensed under CC BY-SA 3.0 or the GNU Free Documentation License.  
This derivative package intentionally adopts **CC BY-SA 3.0 Unported only**, as allowed by the “or alternatively” clause.

---

## 🪶 Attribution (for UIs)

> Translation data © Wiktionary contributors (Matthias Buchmeier et al.), CC BY-SA 3.0 — [en.wiktionary.org](https://en.wiktionary.org/wiki/User:Matthias_Buchmeier)
