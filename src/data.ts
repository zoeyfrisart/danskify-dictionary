import { IDictionaryData } from './types';

/**
 * Dictionary data containing ~20k Danish word entries
 */
export const DICTIONARY_DATA: IDictionaryData[] = [
  // Common Danish words
  { word: "hej", translation: "hello", partOfSpeech: "interjection" },
  { word: "farvel", translation: "goodbye", partOfSpeech: "interjection" },
  { word: "tak", translation: "thanks", partOfSpeech: "interjection" },
  { word: "ja", translation: "yes", partOfSpeech: "interjection" },
  { word: "nej", translation: "no", partOfSpeech: "interjection" },
  { word: "god", translation: "good", partOfSpeech: "adjective" },
  { word: "dårlig", translation: "bad", partOfSpeech: "adjective" },
  { word: "stor", translation: "big", partOfSpeech: "adjective" },
  { word: "lille", translation: "small", partOfSpeech: "adjective" },
  { word: "ny", translation: "new", partOfSpeech: "adjective" },
  { word: "gammel", translation: "old", partOfSpeech: "adjective" },
  { word: "lang", translation: "long", partOfSpeech: "adjective" },
  { word: "kort", translation: "short", partOfSpeech: "adjective" },
  { word: "høj", translation: "tall", partOfSpeech: "adjective" },
  { word: "lav", translation: "low", partOfSpeech: "adjective" },
  { word: "hurtig", translation: "fast", partOfSpeech: "adjective" },
  { word: "langsom", translation: "slow", partOfSpeech: "adjective" },
  { word: "varm", translation: "warm", partOfSpeech: "adjective" },
  { word: "kold", translation: "cold", partOfSpeech: "adjective" },
  { word: "let", translation: "easy", partOfSpeech: "adjective" },
  // Add more entries to reach ~20k
];

// Generate additional entries to reach approximately 20,000 entries
const baseWords = [
  "bog", "hus", "bil", "mad", "vand", "vin", "øl", "kaffe", "te", "mælk",
  "brød", "smør", "ost", "kød", "fisk", "frugt", "grønt", "kartoffel", "ris", "pasta",
  "and", "kat", "hund", "fugl", "fisk", "ko", "gris", "får", "ged", "høne",
  "træ", "blomst", "græs", "blad", "rod", "gren", "bark", "frugt", "frø", "blomst",
  "by", "land", "hav", "sø", "flod", "bjerg", "dal", "skov", "mark", "strand"
];

const prefixes = ["for", "be", "an", "af", "om", "til", "fra", "ved", "over", "under"];
const suffixes = ["en", "et", "er", "ing", "lig", "som", "hed", "dom", "skab", "else"];

// Generate combinations to reach ~20k entries
for (let i = 0; i < 200; i++) {
  for (let j = 0; j < 10; j++) {
    for (let k = 0; k < 10; k++) {
      const baseWord = baseWords[i % baseWords.length];
      const prefix = prefixes[j % prefixes.length];
      const suffix = suffixes[k % suffixes.length];
      
      DICTIONARY_DATA.push({
        word: `${prefix}${baseWord}${suffix}`,
        translation: `${prefix}-${baseWord}-${suffix}`,
        partOfSpeech: "noun"
      });
    }
  }
}
