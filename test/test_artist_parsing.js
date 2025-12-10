const assert = require('assert');
const { parseArtistNames } = require('../src/main/utils');

// Test for the bug fix
console.log('Running test: Artist Name Parsing Logic');

const input = "Simon & Garfunkel; Hall & Oates";
// The correct logic splits by semicolon only
const expected = ["Simon & Garfunkel", "Hall & Oates"];

const result = parseArtistNames(input);

try {
    assert.deepStrictEqual(result, expected);
    console.log('PASS: parseArtistNames correctly splits only on semicolon.');
} catch (e) {
    console.error('FAIL: parseArtistNames failed.');
    console.error('Expected:', expected);
    console.error('Actual:', result);
    process.exit(1);
}

// Verify that the logic in database.js (simulated) would fail if it was still using the old regex
const oldBuggyLogic = (str) => str.split(/[,;&]/).map(n => n.trim());
const buggyResult = oldBuggyLogic(input);
if (buggyResult.length === 4) {
    console.log('verified: The old buggy logic would have split this incorrectly into 4 parts.');
}

// Test case for comma handling (Regression/Feature check)
// "Tyler, The Creator" should NOT be split.
const commaInput = "Tyler, The Creator; Earth, Wind & Fire";
const commaExpected = ["Tyler, The Creator", "Earth, Wind & Fire"];
const commaResult = parseArtistNames(commaInput);

try {
    assert.deepStrictEqual(commaResult, commaExpected);
    console.log('PASS: parseArtistNames correctly preserves commas within artist names.');
} catch (e) {
    console.error('FAIL: parseArtistNames failed on comma handling.');
    console.error('Expected:', commaExpected);
    console.error('Actual:', commaResult);
    process.exit(1);
}

// Test case for empty strings
const emptyInput = "Artist A; ; Artist B";
const emptyExpected = ["Artist A", "Artist B"];
const emptyResult = parseArtistNames(emptyInput);

try {
    assert.deepStrictEqual(emptyResult, emptyExpected);
    console.log('PASS: parseArtistNames correctly filters empty strings.');
} catch (e) {
    console.error('FAIL: parseArtistNames failed on empty string handling.');
    console.error('Expected:', emptyExpected);
    console.error('Actual:', emptyResult);
    process.exit(1);
}
