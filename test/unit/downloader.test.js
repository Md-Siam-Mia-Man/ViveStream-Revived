const Downloader = require('../../src/main/downloader');
const path = require('path');
const events = require('events');
const fs = require('fs');

// Mock dependencies
const mockSpawnPython = jest.fn();
const mockGetSettings = jest.fn();
const mockDb = {
  addOrUpdateVideo: jest.fn(),
  addVideoToPlaylist: jest.fn(),
  addToHistory: jest.fn(),
  findOrCreateArtist: jest.fn(),
  linkVideoToArtist: jest.fn(),
};
const mockBrowserDiscovery = {
  resolveBrowser: jest.fn(),
};
const mockWin = {
  webContents: {
    send: jest.fn(),
  },
};

// Mock python-core
jest.mock('../../src/main/python-core', () => ({
  spawnPython: (...args) => mockSpawnPython(...args),
  getPythonDetails: () => ({ pythonPath: 'python', binDir: 'bin' }),
}));

// Mock fs and fse
jest.mock('fs');
jest.mock('fs-extra', () => ({
  move: jest.fn(),
}));

// Helper to flush promises
const flushPromises = () => new Promise(resolve => {
  // Use setImmediate to break the execution flow and allow other promises to resolve
  // jest.useFakeTimers() mocks setImmediate, so we should rely on Promise.resolve
  if (global.setImmediate) {
    // If real timers are used
    global.setImmediate(resolve);
  } else {
    // Fallback
    Promise.resolve().then(resolve);
  }
});

// Since we are testing with fake timers sometimes, we need a robust wait.
const waitTick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('Downloader', () => {
  let downloader;
  let mockProcess;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default settings
    mockGetSettings.mockReturnValue({
      concurrentDownloads: 3,
      cookieBrowser: 'none',
      downloadSubs: false,
      downloadAutoSubs: false,
      removeSponsors: false,
      concurrentFragments: 1,
      speedLimit: '',
    });

    // Setup mock process for default usage
    mockProcess = new events.EventEmitter();
    mockProcess.kill = jest.fn();
    mockProcess.stdout = new events.EventEmitter();
    mockProcess.stderr = new events.EventEmitter();
    mockSpawnPython.mockReturnValue(mockProcess);

    downloader = new Downloader({
      getSettings: mockGetSettings,
      videoPath: '/mock/video/path',
      coverPath: '/mock/cover/path',
      subtitlePath: '/mock/subtitle/path',
      db: mockDb,
      BrowserDiscovery: mockBrowserDiscovery,
      win: mockWin,
      resolveFfmpegPath: async () => '/mock/ffmpeg',
    });
  });

  test('should start download and process queue', async () => {
    const job = {
      videoInfo: { id: '123', webpage_url: 'http://test.com', title: 'Test Video' },
      downloadType: 'video',
      quality: 'best',
    };

    downloader.addToQueue([job]);
    await waitTick();

    expect(mockSpawnPython).toHaveBeenCalled();
    expect(downloader.activeDownloads.has('123')).toBe(true);

    // Simulate progress
    mockProcess.stdout.emit('data', '[download]  50.0% of 10.00MiB at  2.00MiB/s ETA 00:05');
    expect(mockWin.webContents.send).toHaveBeenCalledWith('download-progress', expect.objectContaining({
      id: '123',
      percent: 50.0
    }));

    // Mock file system for post-process
    fs.readdirSync.mockReturnValue(['123.info.json', '123.mp4', '123.jpg']);
    fs.readFileSync.mockReturnValue(JSON.stringify({
      id: '123',
      title: 'Test Video',
      uploader: 'Tester',
      duration: 100,
      upload_date: '20230101',
      webpage_url: 'http://test.com'
    }));

    // Simulate completion
    mockProcess.emit('close', 0);

    // Wait for postProcess
    await waitTick();

    expect(mockWin.webContents.send).toHaveBeenCalledWith('download-complete', expect.anything());
    expect(mockDb.addOrUpdateVideo).toHaveBeenCalled();
    expect(downloader.activeDownloads.has('123')).toBe(false);
  });

  test('should handle download errors', async () => {
    const job = {
      videoInfo: { id: 'fail', webpage_url: 'http://fail.com', title: 'Fail Video' },
      downloadType: 'video',
      quality: 'best',
    };

    downloader.addToQueue([job]);
    await waitTick();

    // Simulate error output
    mockProcess.stderr.emit('data', 'ERROR: Video unavailable');

    // Simulate failure exit
    mockProcess.emit('close', 1);

    await waitTick();

    expect(mockWin.webContents.send).toHaveBeenCalledWith('download-error', expect.objectContaining({
      error: 'This video is unavailable.'
    }));
    expect(mockDb.addToHistory).toHaveBeenCalledWith(expect.objectContaining({
      status: 'failed'
    }));
  });

  test('should detect stalled downloads', async () => {
    jest.useFakeTimers();
    const job = {
      videoInfo: { id: 'stall', webpage_url: 'http://stall.com', title: 'Stall Video' },
      downloadType: 'video',
      quality: 'best',
    };

    downloader.addToQueue([job]);
    // Allow async start logic to run
    // Using multiple awaits to ensure async/await chain processes
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Simulate no activity for 121s (timeout is 120s)
    jest.advanceTimersByTime(121000);

    expect(mockProcess.kill).toHaveBeenCalled();
    jest.useRealTimers();
  });

  test('should NOT detect stall if progress continues slowly (bad internet simulation)', async () => {
    jest.useFakeTimers();
    const job = {
      videoInfo: { id: 'slow', webpage_url: 'http://slow.com', title: 'Slow Video' },
      downloadType: 'video',
      quality: 'best',
    };

    downloader.addToQueue([job]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Simulate slow progress updates every 80 seconds (just within 90s limit)
    jest.advanceTimersByTime(80000);
    mockProcess.stdout.emit('data', '[download]  10.0% ...');
    expect(mockProcess.kill).not.toHaveBeenCalled();

    jest.advanceTimersByTime(80000);
    mockProcess.stdout.emit('data', '[download]  20.0% ...');
    expect(mockProcess.kill).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  test('should handle concurrent downloads limit', async () => {
    mockGetSettings.mockReturnValue({
      concurrentDownloads: 2, // Limit to 2
      cookieBrowser: 'none'
    });
    // Re-init to pick up mocked settings
    downloader = new Downloader({
      getSettings: mockGetSettings,
      videoPath: '/mock/video/path',
      coverPath: '/mock/cover/path',
      subtitlePath: '/mock/subtitle/path',
      db: mockDb,
      BrowserDiscovery: mockBrowserDiscovery,
      win: mockWin,
      resolveFfmpegPath: async () => '/mock/ffmpeg',
    });

    const jobs = [
      { videoInfo: { id: '1', title: 'V1' }, downloadType: 'video' },
      { videoInfo: { id: '2', title: 'V2' }, downloadType: 'video' },
      { videoInfo: { id: '3', title: 'V3' }, downloadType: 'video' },
    ];

    // Important: we need distinct processes for each download to track them correctly in tests
    // But for this test we mainly care about spawn calls count.
    // However, since we re-used mockSpawnPython that returns the SAME object, we might run into issues if we try to kill them individually or track events.
    // But checking toHaveBeenCalledTimes works.

    // Reset mock call count
    mockSpawnPython.mockClear();

    downloader.addToQueue(jobs);
    await waitTick();

    expect(mockSpawnPython).toHaveBeenCalledTimes(2); // Only 2 started
    expect(downloader.activeDownloads.size).toBe(2);
    expect(downloader.queue.length).toBe(1);
  });
});

describe('Downloader Concurrency', () => {
  let downloader;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGetSettings.mockReturnValue({
      concurrentDownloads: 2,
      cookieBrowser: 'none'
    });

    // Return unique process for each spawn
    mockSpawnPython.mockImplementation(() => {
      const p = new events.EventEmitter();
      p.kill = jest.fn();
      p.stdout = new events.EventEmitter();
      p.stderr = new events.EventEmitter();
      return p;
    });

    downloader = new Downloader({
      getSettings: mockGetSettings,
      videoPath: '/mock',
      coverPath: '/mock',
      subtitlePath: '/mock',
      db: mockDb,
      BrowserDiscovery: mockBrowserDiscovery,
      win: mockWin,
      resolveFfmpegPath: async () => '/mock/ffmpeg',
    });
  });

  test('should respect concurrent limit and start queued items when one finishes', async () => {
    const jobs = [
      { videoInfo: { id: '1', title: 'V1' }, downloadType: 'video' },
      { videoInfo: { id: '2', title: 'V2' }, downloadType: 'video' },
      { videoInfo: { id: '3', title: 'V3' }, downloadType: 'video' },
    ];

    downloader.addToQueue(jobs);
    await waitTick();

    expect(downloader.activeDownloads.size).toBe(2);
    expect(downloader.activeDownloads.has('1')).toBe(true);
    expect(downloader.activeDownloads.has('2')).toBe(true);
    expect(downloader.activeDownloads.has('3')).toBe(false);

    // Mock filesystem for success
    fs.readdirSync.mockReturnValue(['1.info.json', '1.mp4']);
    fs.readFileSync.mockReturnValue(JSON.stringify({ id: '1', title: 'V1' }));

    // Finish job 1
    const p1 = downloader.activeDownloads.get('1');
    p1.emit('close', 0);

    // Wait for postProcess
    await waitTick();

    expect(downloader.activeDownloads.has('1')).toBe(false);
    expect(downloader.activeDownloads.has('3')).toBe(true); // Job 3 should start now
    expect(downloader.activeDownloads.size).toBe(2);
  });
});
