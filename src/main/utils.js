function parseArtistNames(artistString) {
  return artistString
    ? artistString.split(/[;]/).map((name) => name.trim()).filter(Boolean)
    : [];
}

module.exports = {
  parseArtistNames
};
