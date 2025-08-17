# CLI Integration Tests

This directory contains integration tests for the CLI commands that test the actual built CLI binary.

## Test Files

### `download-cli.test.ts` - Download Command Integration Tests

- Tests the actual built CLI binary using `zx`
- Tests the complete CLI workflow including argument parsing
- Tests various CLI options (User-Agent, retries, etc.)
- Tests help and version commands
- Tests error handling for invalid inputs
- **Run with**: `bun test cli/commands/__tests__/download-cli.test.ts`

### `dir-tree-cli.test.ts` - Directory Tree Command Integration Tests

- Tests the actual built CLI binary using `zx`
- Tests the complete CLI workflow including argument parsing
- Tests various CLI options (max-depth, show-hidden, exclude, etc.)
- Tests help and version commands
- Tests error handling for invalid inputs
- Uses deterministic test directory structure for reliable snapshots
- **Run with**: `bun test cli/commands/__tests__/dir-tree-cli.test.ts`

## Test Coverage

### Download Command Tests

All tests download the same test file: `https://raw.githubusercontent.com/thedevdojo/pines/refs/heads/main/cover.jpg`

### Directory Tree Command Tests

All tests use a deterministic test directory structure in `test-dir-tree/` with:

- Regular files: `file1.txt`, `file2.txt`, `file3.txt`, `file4.txt`, `file5.txt`
- Directories: `folder1/`, `folder2/`, `folder2/subfolder/`
- Hidden files: `.hidden/secret.txt`

### What the Tests Validate:

#### Download Command:

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

#### Directory Tree Command:

- ✅ CLI binary compilation and execution
- ✅ Directory tree generation
- ✅ File and directory filtering
- ✅ Hidden file handling (`--show-hidden`)
- ✅ Depth limiting (`--max-depth`)
- ✅ Pattern exclusion (`--exclude`)
- ✅ File visibility control (`--no-show-files`)
- ✅ Current directory handling (`.`)
- ✅ Help and version commands
- ✅ Error handling for non-existent directories
- ✅ Exit code validation

## Running Tests

```bash
# Run individual test suites
bun test cli/commands/__tests__/download-cli.test.ts
bun test cli/commands/__tests__/dir-tree-cli.test.ts

# Run all tests (including CLI integration tests)
bun test
```

## Test Environment

- **Deterministic Directories**: Tests use fixed directory structures for reliable snapshots
- **Network Timeouts**: Download tests include appropriate timeouts for network operations (30-60 seconds)
- **Error Simulation**: Tests include invalid scenarios to verify error handling
- **File Validation**: Downloaded files are validated for format and content
- **CLI Building**: Tests automatically build the project before running
- **Automatic Cleanup**: Test directories are automatically cleaned up after tests

## Dependencies

- `zx` - For executing CLI commands and capturing output
- `bun:test` - For the test framework
- `node:fs/promises` - For file operations
- `node:path` - For path manipulation

## Notes

- Tests use `zx` to execute the actual built CLI binary (`node dist/cli.js <command> ...`)
- Tests verify the real end-user experience rather than just internal functions
- Directory tree tests use `toMatchInlineSnapshot` for reliable output validation
- Download tests use the Pines cover image (~97KB) as a good test case
- All tests use deterministic paths to avoid flaky test behavior
