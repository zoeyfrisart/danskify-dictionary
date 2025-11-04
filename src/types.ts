/**
 * Interface representing a dictionary entry
 */
export interface IDictionaryData {
  /**
   * The Danish word
   */
  word: string;
  
  /**
   * English translation
   */
  translation: string;
  
  /**
   * Part of speech (noun, verb, adjective, etc.)
   */
  partOfSpeech?: string;
}
