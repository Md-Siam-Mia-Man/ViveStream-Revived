const path = require('path');

// 1. Define Mocks with Factories so they execute before require
jest.mock('fs', () => ({
    existsSync: jest.fn()
}));

jest.mock('os', () => ({
    homedir: jest.fn(() => '/home/user'),
    platform: jest.fn()
}));

describe('Browser Discovery Logic', () => {
    let BrowserDiscovery;
    let mockFs;
    let originalPlatform;
    let originalEnv;

    beforeAll(() => {
        originalPlatform = process.platform;
        originalEnv = { ...process.env };
    });

    afterAll(() => {
        Object.defineProperty(process, 'platform', { value: originalPlatform });
        process.env = originalEnv;
    });

    beforeEach(() => {
        jest.resetModules();

        // Setup Environment variables for this test run
        process.env.LOCALAPPDATA = 'C:\\Users\\User\\AppData\\Local';
        process.env.APPDATA = 'C:\\Users\\User\\AppData\\Roaming';

        mockFs = require('fs');
        // Because of resetModules, we need to re-require the module under test
        BrowserDiscovery = require('../../src/main/browser-discovery');
    });

    test('Linux: Should resolve Brave Flatpak if native missing', () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });

        const nativePath = path.join('/home/user', '.config', 'BraveSoftware', 'Brave-Browser');
        const flatpakPath = path.join('/home/user', '.var', 'app', 'com.brave.Browser', 'config', 'BraveSoftware', 'Brave-Browser');

        // Allow explicit check for flatpak path
        mockFs.existsSync.mockImplementation((p) => p === flatpakPath);

        const result = BrowserDiscovery.resolveBrowser('brave');
        expect(result).toBe(`brave:${flatpakPath}`);
    });

    test('Linux: Should prioritize Native over Flatpak', () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });

        const nativePath = path.join('/home/user', '.config', 'google-chrome');
        const flatpakPath = path.join('/home/user', '.var', 'app', 'com.google.Chrome', 'config', 'google-chrome');

        mockFs.existsSync.mockImplementation((p) => p === nativePath || p === flatpakPath);

        const result = BrowserDiscovery.resolveBrowser('chrome');
        expect(result).toBe(`chrome:${nativePath}`);
    });

    test('Windows: Should resolve standard Chrome path', () => {
        Object.defineProperty(process, 'platform', { value: 'win32' });

        // Use path.join to ensure delimiters match the OS running the test
        const chromePath = path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data');

        mockFs.existsSync.mockImplementation((p) => p === chromePath);

        const result = BrowserDiscovery.resolveBrowser('chrome');
        expect(result).toBe(`chrome:${chromePath}`);
    });

    test('Auto Mode: Should pick first available browser', () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });

        // Simulate Brave missing, but Firefox Snap exists
        const firefoxSnap = path.join('/home/user', 'snap', 'firefox', 'common', '.mozilla', 'firefox');
        mockFs.existsSync.mockImplementation((p) => p === firefoxSnap);

        const result = BrowserDiscovery.resolveBrowser('auto');
        expect(result).toBe(`firefox:${firefoxSnap}`);
    });

    test('Should return user selection if detection fails', () => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
        mockFs.existsSync.mockReturnValue(false); // Nothing exists

        const result = BrowserDiscovery.resolveBrowser('opera');
        // Fallback to just the name so yt-dlp can try its own internal logic
        expect(result).toBe('opera');
    });
});