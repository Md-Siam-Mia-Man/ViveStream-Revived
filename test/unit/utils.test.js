const { parseArtistNames } = require('../../src/main/utils');

describe('Utility Functions', () => {
  describe('parseArtistNames', () => {
    test('should return ["Unknown"] for empty input', () => {
      expect(parseArtistNames(null)).toEqual(["Unknown"]);
      expect(parseArtistNames("")).toEqual(["Unknown"]);
    });

    test('should split by semicolon', () => {
      const input = "Artist A; Artist B";
      const expected = ["Artist A", "Artist B"];
      expect(parseArtistNames(input)).toEqual(expected);
    });

    test('should split by "feat."', () => {
      const input = "Artist A feat. Artist B";
      const expected = ["Artist A", "Artist B"];
      expect(parseArtistNames(input)).toEqual(expected);
    });

    test('should split by "ft."', () => {
      const input = "Artist A ft. Artist B";
      const expected = ["Artist A", "Artist B"];
      expect(parseArtistNames(input)).toEqual(expected);
    });

    test('should NOT split by comma (preserving names like "Tyler, The Creator")', () => {
      const input = "Tyler, The Creator";
      const expected = ["Tyler, The Creator"];
      expect(parseArtistNames(input)).toEqual(expected);
    });

    test('should NOT split list by comma (requires semicolon)', () => {
      const input = "Artist A, Artist B";
      // Current logic strictly requires semicolon or feat/ft
      const expected = ["Artist A, Artist B"];
      expect(parseArtistNames(input)).toEqual(expected);
    });

    test('should filter out "Topic" and "Various Artists"', () => {
      const input = "Artist A; Topic; Various Artists";
      const expected = ["Artist A"];
      expect(parseArtistNames(input)).toEqual(expected);
    });

    test('should trim whitespace', () => {
      const input = "  Artist A  ;  Artist B  ";
      const expected = ["Artist A", "Artist B"];
      expect(parseArtistNames(input)).toEqual(expected);
    });
  });
});