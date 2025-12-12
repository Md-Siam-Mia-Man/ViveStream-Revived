const fs = require("fs");
const path = require("path");

// * --------------------------------------------------------------------------
// * UTILITY FUNCTIONS
// * --------------------------------------------------------------------------

/**
 * * Parses a string of artist names using various delimiters.
 * ! Handles semicolon and 'feat' separators.
 * ! Comma (,) and Ampersand (&) are ignored to preserve names like "Tyler, The Creator" or "Simon & Garfunkel".
 * @param {string} artistString - The raw artist string from metadata (e.g. "Artist A; Artist B feat. C")
 * @returns {string[]} An array of cleaned artist names.
 */
function parseArtistNames(artistString) {
  if (!artistString) return ["Unknown"];

  // ! Split by delimiters: semicolon, 'feat.', 'ft.'
  // ? Regex explanation:
  // ? [;] -> Semicolon only
  // ? \s+feat\.?\s+ -> ' feat. ' or ' feat '
  // ? \s+ft\.?\s+ -> ' ft. ' or ' ft '
  const splitRegex = /;|\s+feat\.?\s+|\s+ft\.?\s+/i;

  return artistString
    .split(splitRegex)
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && name.toLowerCase() !== "topic" && name.toLowerCase() !== "various artists");
}

module.exports = {
  parseArtistNames,
};