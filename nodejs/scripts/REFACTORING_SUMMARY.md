# Refactoring Summary: Common Utilities Extraction

## Overview

This document summarizes the refactoring work done to extract common utilities from `move-completed.ts` and `fix-unsplit-cue.ts` into a shared `utils.ts` file.

## Files Modified

### 1. `utils.ts` (New File)

- **Purpose**: Centralized utility functions and constants
- **Location**: `nodejs/scripts/utils.ts`

### 2. `move-completed.ts` (Refactored)

- **Changes**: Removed duplicate utilities, imported from `utils.ts`
- **Location**: `nodejs/scripts/move-completed.ts`

### 3. `fix-unsplit-cue.ts` (Refactored)

- **Changes**: Removed duplicate utilities, imported from `utils.ts`
- **Location**: `nodejs/scripts/fix-unsplit-cue.ts`

### 4. `test-utils.ts` (New File)

- **Purpose**: Test script to verify utils.ts functionality
- **Location**: `nodejs/scripts/test-utils.ts`

## Extracted Utilities

### Constants

```typescript
export const FILE_EXTENSIONS = {
  CUE: ".cue",
  FLAC: ".flac",
  MP3: ".mp3",
  M4A: ".m4a",
  WAV: ".wav",
  OGG: ".ogg",
} as const;

export const MUSIC_EXTENSIONS = [
  FILE_EXTENSIONS.FLAC,
  FILE_EXTENSIONS.MP3,
  FILE_EXTENSIONS.M4A,
  FILE_EXTENSIONS.WAV,
  FILE_EXTENSIONS.OGG,
] as const;
```

### File System Utilities

- `exists(path: string): Promise<boolean>` - Check if file/directory exists
- `ensureDirectory(dirPath: string): Promise<void>` - Create directory recursively
- `readDirectory(dirPath: string): Promise<string[]>` - Read directory contents
- `readDirectoryWithTypes(dirPath: string)` - Read directory with file types
- `moveFile(source, destination): Promise<void>` - Move file
- `copyFile(source, destination): Promise<void>` - Copy file
- `removeFile(filePath: string): Promise<void>` - Remove file
- `removeDirectory(dirPath: string): Promise<void>` - Remove directory

### File Type Checking

- `isMusicFile(file: string): boolean` - Check if file is music format
- `isFlacFile(file: string): boolean` - Check if file is FLAC
- `isCueFile(file: string): boolean` - Check if file is CUE
- `hasExtension(file: string, extension: string): boolean` - Check file extension

### Path Manipulation

- `getBasename(file: string, ext?: string): string` - Get filename with optional extension removal
- `getDirname(filePath: string): string` - Get directory name
- `joinPath(...paths: string[]): string` - Join path segments
- `resolvePath(...paths: string[]): string` - Resolve absolute path

### User Interaction

- `confirm(message: string): Promise<boolean>` - Prompt for confirmation
- `promptForInput(message, defaultValue?, validator?): Promise<string>` - Prompt for input

### Logging Utilities

- `logInfo(message: string): void` - Info level logging
- `logSuccess(message: string): void` - Success level logging
- `logWarning(message: string): void` - Warning level logging
- `logError(message: string): void` - Error level logging
- `logProgress(message: string): void` - Progress level logging
- `logFile(message: string): void` - File-related logging
- `logMusic(message: string): void` - Music-related logging
- `logDirectory(message: string): void` - Directory-related logging

### Error Handling

- `handleError(error: unknown, context: string): void` - Handle errors with context
- `withErrorHandling<T>(operation, context, fallback?): Promise<T | undefined>` - Wrap operations with error handling

### Validation

- `validateDirectory(dirPath: string): Promise<boolean>` - Validate directory exists
- `validateFile(filePath: string): Promise<boolean>` - Validate file exists

### Array Utilities

- `filterFiles(files: string[], predicate): string[]` - Filter files
- `mapFiles<T>(files: string[], mapper): T[]` - Map over files

### Summary Utilities

- `displaySummary(successCount, failureCount, totalCount): void` - Display processing summary

### Common Types

```typescript
export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface ProcessingResult {
  success: boolean;
  error?: string;
}

export interface SummaryStats {
  successCount: number;
  failureCount: number;
  totalCount: number;
}
```

## Benefits Achieved

### 1. **Code Reusability**

- Common utilities are now shared between scripts
- No more duplicate function definitions
- Consistent behavior across different scripts

### 2. **Maintainability**

- Single source of truth for utility functions
- Easier to update and fix bugs
- Centralized logging and error handling

### 3. **Consistency**

- Standardized logging format with emojis
- Consistent error handling patterns
- Uniform file operations

### 4. **Type Safety**

- Shared TypeScript interfaces
- Better type checking across scripts
- Improved IDE support

### 5. **Testing**

- Utilities can be tested independently
- Easier to write unit tests
- Better test coverage

## Migration Changes

### Before (Duplicate Code)

```typescript
// In move-completed.ts
const exists = async (path: string) =>
  await fs.access(path).then(() => true).catch(() => false);

const confirm = async (message: string) => {
  const { proceed } = await inquirer.prompt([...]);
  return proceed;
};

// In fix-unsplit-cue.ts (duplicate)
const exists = async (path: string) =>
  await fs.access(path).then(() => true).catch(() => false);

const confirm = async (message: string) => {
  const { proceed } = await inquirer.prompt([...]);
  return proceed;
};
```

### After (Shared Utilities)

```typescript
// In utils.ts
export const exists = async (path: string): Promise<boolean> =>
  await fs.access(path).then(() => true).catch(() => false);

export const confirm = async (message: string): Promise<boolean> => {
  const { proceed } = await inquirer.prompt([...]);
  return proceed;
};

// In both scripts
import { exists, confirm } from "./utils.js";
```

## Testing

The refactoring includes a test script (`test-utils.ts`) that verifies:

- Constants are correctly defined
- File type checking functions work
- Path manipulation utilities function properly
- Logging functions output correctly
- File system utilities work as expected

Run the test with:

```bash
cd nodejs
npx tsx scripts/test-utils.ts
```

## Future Improvements

1. **Additional Utilities**: Consider adding more specialized utilities as needed
2. **Configuration**: Move hardcoded paths to configuration files
3. **Error Recovery**: Add more sophisticated error recovery mechanisms
4. **Performance**: Optimize file operations for large directories
5. **Documentation**: Add JSDoc comments to all utility functions

## Compatibility

- All existing functionality is preserved
- No breaking changes to public APIs
- Scripts continue to work as before
- Backward compatibility maintained
