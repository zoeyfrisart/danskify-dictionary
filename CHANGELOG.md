# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-11-05

### Added

#### Toxicity Filtering System

- **Local toxicity detection**: Added automated filtering using `Xenova/toxic-bert` model to identify and remove offensive, profane, or unsafe dictionary entries
- **AI-powered audit**: Implemented `gpt-5` review system to double-check flagged entries and restore false positives
- **Review system**: Generated `data-review.json` file containing borderline entries for manual review
- **Toxicity analysis**: Added toxicity histogram generation (`toxicity-histogram.json`) for distribution analysis
- **Data artifacts**: New output files for transparency:
  - `data/data-clean.json` - Filtered safe entries
  - `data/data-removed.json` - Removed offensive entries
  - `data/data-restored.json` - Entries restored by AI audit
  - `data/data-review.json` - Borderline entries for manual review
  - `data/toxicity-histogram.json` - Toxicity score distribution

#### New Scripts & Commands

- `yarn remove-offensive` - Run the toxicity filtering pipeline
- Enhanced `prepublishOnly` script to automatically copy clean data before publishing

#### Dependencies

- Added `openai` package for AI-powered entry review
- Added `dotenv` for environment variable management

### Changed

#### Data Organization

- Reorganized data files into dedicated `data/` directory for better project structure
- Renamed `src/data-shuffled.json` → `data/data-clean.json` to reflect filtered nature
- Updated build process to use clean data from `data/` directory

#### Documentation

- Enhanced README with comprehensive data processing documentation
- Added detailed workflow for toxicity filtering and AI audit
- Documented new data processing pipeline steps

#### Build Process

- Updated `prepublishOnly` script to copy `data-clean.json` to `src/data.json` before build
- Improved build workflow for cleaner data distribution

### Technical Details

#### Toxicity Filtering

- **Model**: `Xenova/toxic-bert` for local toxicity classification
- **Threshold**: 0.45 for automatic removal
- **Review margin**: ±0.05 for borderline entry identification
- **Batch processing**: 64 entries per batch for efficient processing

#### AI Audit

- **Model**: `gpt-5` with strict whitelist prompt
- **Purpose**: Restore safe entries that were incorrectly flagged
- **Output**: `data-restored.json` with entries recommended for restoration
- **Expected restoration**: ~50 entries typically restored per audit

### Impact

This release significantly improves the quality and safety of the dictionary dataset by:

- Removing offensive, profane, and unsafe content
- Providing transparency through detailed filtering artifacts
- Enabling manual review of borderline cases
- Using AI assistance to minimize false positives

The dataset is now more suitable for educational and family-friendly applications while maintaining comprehensive coverage of the Danish language.

### Breaking changes

This version removes the data-shuffled.json variant of the dataset, if you need a shuffled version we recommend either doing it in the codebase or staying on `v1.1.4`
