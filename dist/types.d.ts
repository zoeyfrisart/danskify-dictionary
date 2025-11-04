export type WordForm = 'noun' | 'verb' | 'adjective' | 'adverb' | 'preposition' | 'pronoun' | 'determiner' | 'conjunction' | 'interjection' | 'phrase' | 'properNoun' | 'numeral' | 'abbreviation' | 'article' | 'prefix' | 'suffix' | 'proverb' | 'particle' | 'contraction';
/**
 * Interface representing a dictionary entry
 */
export interface IDictionaryEntry {
    engelsk: string;
    dansk: string;
    form?: WordForm | undefined;
    extraUsageContext?: string;
    wordCount?: number | undefined;
    notes?: string[] | undefined;
}
