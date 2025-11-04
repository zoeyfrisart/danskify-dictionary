# danskify-dictionary

A TypeScript package containing Danish dictionary data with approximately 20,000 entries.

## Installation

```bash
npm install danskify-dictionary
# or
yarn add danskify-dictionary
```

## Usage

```typescript
import { DICTIONARY_DATA, IDictionaryData } from 'danskify-dictionary';

// Access the dictionary data
console.log(DICTIONARY_DATA.length); // ~20000

// Example entry structure
const entry: IDictionaryData = DICTIONARY_DATA[0];
console.log(entry);
// {
//   word: "hej",
//   translation: "hello",
//   partOfSpeech: "interjection"
// }
```

## Exports

### `DICTIONARY_DATA`
An array containing approximately 20,000 Danish dictionary entries.

### `IDictionaryData`
TypeScript interface for dictionary entries:

```typescript
interface IDictionaryData {
  word: string;           // The Danish word
  translation: string;    // English translation
  partOfSpeech?: string;  // Part of speech (optional)
}
```

## Development

This package is built using TypeScript and managed with Yarn v4.

### Building

```bash
yarn build
```

## License

MIT