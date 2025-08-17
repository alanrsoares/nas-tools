# Download Command Integration Tests

This directory contains integration tests for the download command functionality that test the actual built CLI binary.

## Test File

### `download-cli.test.ts` - CLI Integration Tests

- Tests the actual built CLI binary using `zx`
- Tests the complete CLI workflow including argument parsing
- Tests various CLI options (User-Agent, retries, etc.)
- Tests help and version commands
- Tests error handling for invalid inputs
- **Run with**: `bun test cli/commands/__tests__/download-cli.test.ts`

## Test Coverage

All tests download the same test file: `https://raw.githubusercontent.com/thedevdojo/pines/refs/heads/main/cover.jpg`

### What the Tests Validate:

- ✅ CLI binary compilation and execution
- ✅ File download functionality
- ✅ File existence and content validation
- ✅ JPEG format validation (magic bytes)
- ✅ Error handling for invalid URLs
- ✅ CLI argument parsing and options
- ✅ Custom User-Agent support
- ✅ Help and version commands
- ✅ Missing argument handling
- ✅ Exit code validation

## Running Tests

```bash
# Run the CLI integration tests
bun test cli/commands/__tests__/download-cli.test.ts

# Run all tests (including download tests)
bun test
```

## Test Environment

- **Temporary Directories**: Tests create temporary directories that are automatically cleaned up
- **Network Timeouts**: Tests include appropriate timeouts for network operations (30-60 seconds)
- **Error Simulation**: Tests include invalid URL scenarios to verify error handling
- **File Validation**: Downloaded files are validated for format and content
- **CLI Building**: Tests automatically build the project before running

## Dependencies

- `zx` - For executing CLI commands and capturing output
- `bun:test` - For the test framework
- `node:fs/promises` - For file operations
- `node:os` - For temporary directory creation
- `node:path` - For path manipulation

## Notes

- Tests use `zx` to execute the actual built CLI binary (`node dist/cli.js download ...`)
- Tests verify the real end-user experience rather than just internal functions
- The test image (Pines cover) is ~97KB and serves as a good test case
- All tests use temporary directories to avoid polluting the filesystem
