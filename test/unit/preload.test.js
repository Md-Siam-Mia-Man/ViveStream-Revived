const mockIpcRenderer = {
  invoke: jest.fn(),
  send: jest.fn(),
  on: jest.fn(),
};

const mockContextBridge = {
  exposeInMainWorld: jest.fn(),
};

// Mock Electron
jest.mock('electron', () => ({
  ipcRenderer: mockIpcRenderer,
  contextBridge: mockContextBridge,
}));

describe('Preload Script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  test('should expose "electronAPI" to the main world', () => {
    require('../../src/preload/preload');
    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      'electronAPI',
      expect.any(Object)
    );
  });

  test('should expose correct API methods', () => {
    require('../../src/preload/preload');
    const exposedApi = mockContextBridge.exposeInMainWorld.mock.calls[0][1];

    expect(exposedApi).toHaveProperty('getLibrary');
    expect(exposedApi).toHaveProperty('downloadVideo');
    expect(exposedApi).toHaveProperty('cancelDownload');
    expect(exposedApi).toHaveProperty('onDownloadProgress');
  });

  test('downloadVideo should call ipcRenderer.send("download-video")', () => {
    require('../../src/preload/preload');
    const exposedApi = mockContextBridge.exposeInMainWorld.mock.calls[0][1];

    const options = { url: 'http://test.com' };
    const jobId = '123';
    exposedApi.downloadVideo(options, jobId);

    expect(mockIpcRenderer.send).toHaveBeenCalledWith('download-video', { downloadOptions: options, jobId });
  });

  test('getLibrary should call ipcRenderer.invoke("get-library")', () => {
    require('../../src/preload/preload');
    const exposedApi = mockContextBridge.exposeInMainWorld.mock.calls[0][1];

    exposedApi.getLibrary();

    expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('get-library');
  });
});
