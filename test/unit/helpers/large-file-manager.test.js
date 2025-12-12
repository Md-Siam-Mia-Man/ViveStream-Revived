const fs = require('fs');
const path = require('path');
const os = require('os');

jest.mock('fs');
const mockExit = jest.spyOn(process, 'exit').mockImplementation((number) => {});

describe('Large File Manager', () => {
    let largeFileManager;

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        mockExit.mockClear();

        const fs = require('fs');
        fs.existsSync.mockReturnValue(true);
        fs.statSync.mockReturnValue({ isDirectory: () => false, size: 100 });
        fs.readdirSync.mockReturnValue([]);
        fs.openSync.mockReturnValue(1);
        fs.readSync.mockReturnValue(0);
        fs.writeFileSync.mockImplementation(() => {});
        fs.unlinkSync.mockImplementation(() => {});
        fs.closeSync.mockImplementation(() => {});
    });

    test('should load without exiting', () => {
        largeFileManager = require('../../../helpers/large-file-manager');
        expect(mockExit).not.toHaveBeenCalled();
    });

    test('splitFile should split', () => {
        const fs = require('fs');
        largeFileManager = require('../../../helpers/large-file-manager');
        const { splitFile } = largeFileManager;

        const CHUNK_SIZE = 1024 * 1024 * 90;

        // Setup mocks for this specific test
        fs.statSync.mockReturnValue({ size: CHUNK_SIZE + 100 });

        fs.openSync.mockReturnValue(123);
        fs.readSync.mockReturnValueOnce(CHUNK_SIZE).mockReturnValueOnce(100).mockReturnValueOnce(0);

        const testFile = path.join(os.tmpdir(), 'large.bin');
        splitFile(testFile);

        expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    });
});
