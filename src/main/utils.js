const fs = require("fs");
const path = require("path");

// * --------------------------------------------------------------------------
// * UTILITY FUNCTIONS
// * --------------------------------------------------------------------------

/**
 * * Parses a string of artist names using various delimiters.
 * ! Handles comma, semicolon, ampersand, and 'feat' separators.
 * @param {string} artistString - The raw artist string from metadata (e.g. "Artist A, Artist B feat. C")
 * @returns {string[]} An array of cleaned artist names.
 */
function parseArtistNames(artistString) {
  if (!artistString) return ["Unknown"];

  // ! Split by common delimiters: comma, semicolon, &, 'feat.', 'ft.'
  // ? Regex explanation:
  // ? [,;&] -> Standard separators
  // ? \s+feat\.?\s+ -> ' feat. ' or ' feat '
  // ? \s+ft\.?\s+ -> ' ft. ' or ' ft '
  const splitRegex = /[,;&]|\s+feat\.?\s+|\s+ft\.?\s+/i;

  return artistString
    .split(splitRegex)
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && name.toLowerCase() !== "topic" && name.toLowerCase() !== "various artists");
}

module.exports = {
  parseArtistNames,
};