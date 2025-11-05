/**
 * @file English–Danish dictionary data
 * Derived from the Wiktionary dataset by Matthias Buchmeier and contributors
 * https://en.wiktionary.org/wiki/User:Matthias_Buchmeier
 *
 * Licensed under CC BY-SA 3.0 (Unported)
 * https://creativecommons.org/licenses/by-sa/3.0/
 *
 * © 2002–2020 Wiktionary contributors
 * © 2025 Danskify contributors (data conversion and JSON formatting)
 */

// # English :: Danish dictionary extracted from http://en.wiktionary.org/
// # License :: Creative Commons Attribution-ShareAlike 3.0 Unported License; GNU Free Documentation License
// # Version :: 20200401
// # Size :: 32332 English glosses; 34346 Danish translations
// # URL :: http://en.wiktionary.org/wiki/User:Matthias_Buchmeier
import data from './data.json'
import type { IDictionaryEntry } from './types'

export const dictionary = data as IDictionaryEntry[]

export { type IDictionaryEntry } from './types'
