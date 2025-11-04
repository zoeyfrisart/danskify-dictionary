/**
 * Interface representing a dictionary entry
 */
export interface IDictionaryEntry {
  engelsk: string;
  dansk: string;
  form?: "noun" | "verb" | "adjective" | "phrase" | "pronoun" | undefined;
  extraUsageContext?: string;
  wordCount?: number | undefined;
}
