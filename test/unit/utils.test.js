const { parseArtistNames, parseYtDlpError } = require('../../src/main/utils');

describe('Utility Functions', () => {
  describe('parseYtDlpError', () => {
    test('should identify missing FFmpeg binary', () => {
      const stderr = "some logs\nffmpeg not found\nmore logs";
      expect(parseYtDlpError(stderr)).toBe("FFmpeg binary missing. Please re-run the app or check internet connection.");
    });

    test('should identify private video', () => {
      const stderr = "ERROR: Private video";
      expect(parseYtDlpError(stderr)).toBe("This video is private.");
    });

    test('should identify unavailable video', () => {
      const stderr = "ERROR: Video unavailable";
      expect(parseYtDlpError(stderr)).toBe("This video is unavailable.");
    });

    test('should extract specific ERROR message', () => {
      const stderr = "some info\nERROR: Specific error message \nmore info";
      expect(parseYtDlpError(stderr)).toBe("Specific error message");
    });

    test('should fallback to last line if no ERROR prefix found', () => {
      const stderr = "Line 1\nLine 2\nLast error line";
      expect(parseYtDlpError(stderr)).toBe("Last error line");
    });

    test('should return Unknown error for empty string', () => {
      expect(parseYtDlpError("")).toBe("Unknown error");
    });
  });

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