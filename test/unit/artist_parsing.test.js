const { parseArtistNames } = require('../../src/main/utils');

describe('Artist Name Parsing Logic', () => {
    test('correctly splits only on semicolon', () => {
        const input = "Simon & Garfunkel; Hall & Oates";
        const expected = ["Simon & Garfunkel", "Hall & Oates"];
        const result = parseArtistNames(input);
        expect(result).toEqual(expected);
    });

    test('correctly preserves commas within artist names', () => {
        const commaInput = "Tyler, The Creator; Earth, Wind & Fire";
        const commaExpected = ["Tyler, The Creator", "Earth, Wind & Fire"];
        const commaResult = parseArtistNames(commaInput);
        expect(commaResult).toEqual(commaExpected);
    });

    test('correctly filters empty strings', () => {
        const emptyInput = "Artist A; ; Artist B";
        const emptyExpected = ["Artist A", "Artist B"];
        const emptyResult = parseArtistNames(emptyInput);
        expect(emptyResult).toEqual(emptyExpected);
    });
});
