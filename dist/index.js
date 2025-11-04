"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dictionary = void 0;
// # English :: Danish dictionary extracted from http://en.wiktionary.org/
// # License :: Creative Commons Attribution-ShareAlike 3.0 Unported License; GNU Free Documentation License
// # Version :: 20200401
// # Size :: 32332 English glosses; 34346 Danish translations
// # URL :: http://en.wiktionary.org/wiki/User:Matthias_Buchmeier
const data_json_1 = __importDefault(require("./data.json"));
exports.dictionary = data_json_1.default;
