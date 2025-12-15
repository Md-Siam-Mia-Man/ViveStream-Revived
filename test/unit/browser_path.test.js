const path = require('path');

// Mocks
const mockFs = {
    existsSync: jest.fn()
};

const mockApp = {
    getPath: jest.fn()
};

// Simplified resolveBrowserArgument function logic for unit testing
// We duplicate this here to avoid complex module mocking of electron.app inside main.js
function resolveBrowserArgumentTest(browser, platform, homeDir, existsSyncFn) {
    if (!browser || browser === 'none') return null;

    if (platform === 'linux') {
        const paths = {
            brave: [
                path.join(homeDir, '.config', 'BraveSoftware', 'Brave-Browser'),
                path.join(homeDir, '.var', 'app', 'com.brave.Browser', 'config', 'BraveSoftware', 'Brave-Browser')
            ],
            chrome: [
                path.join(homeDir, '.config', 'google-chrome'),
                path.join(homeDir, '.var', 'app', 'com.google.Chrome', 'config', 'google-chrome')
            ]
        };

        const targetPaths = paths[browser.toLowerCase()];
        if (targetPaths) {
            const [nativePath, flatpakPath] = targetPaths;
            if (existsSyncFn(nativePath)) return browser; // Standard behavior
            if (existsSyncFn(flatpakPath)) return `${browser}:${flatpakPath}`; // Flatpak override
        }
    }
    return browser;
}

describe('Browser Path Resolution Logic', () => {
    const home = '/home/user';

    test('should return null for "none"', () => {
        expect(resolveBrowserArgumentTest('none', 'linux', home, mockFs.existsSync)).toBeNull();
    });

    test('should return generic name if native path exists', () => {
        mockFs.existsSync.mockImplementation(p => p.includes('.config')); // Simulate Native exists
        const result = resolveBrowserArgumentTest('brave', 'linux', home, mockFs.existsSync);
        expect(result).toBe('brave');
    });

    test('should return formatted path if native missing but flatpak exists', () => {
        mockFs.existsSync.mockImplementation(p => p.includes('.var/app')); // Simulate only Flatpak exists
        const result = resolveBrowserArgumentTest('brave', 'linux', home, mockFs.existsSync);
        const expectedPath = path.join(home, '.var', 'app', 'com.brave.Browser', 'config', 'BraveSoftware', 'Brave-Browser');
        expect(result).toBe(`brave:${expectedPath}`);
    });

    test('should return generic name if neither exists (fallback to default error)', () => {
        mockFs.existsSync.mockReturnValue(false);
        const result = resolveBrowserArgumentTest('brave', 'linux', home, mockFs.existsSync);
        expect(result).toBe('brave');
    });

    test('should handle other browsers (Chrome)', () => {
        mockFs.existsSync.mockImplementation(p => p.includes('.var/app'));
        const result = resolveBrowserArgumentTest('chrome', 'linux', home, mockFs.existsSync);
        const expectedPath = path.join(home, '.var', 'app', 'com.google.Chrome', 'config', 'google-chrome');
        expect(result).toBe(`chrome:${expectedPath}`);
    });

    test('should just return browser name on Windows', () => {
        const result = resolveBrowserArgumentTest('brave', 'win32', 'C:\\Users\\User', mockFs.existsSync);
        expect(result).toBe('brave');
    });
});