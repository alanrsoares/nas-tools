# Code Style Guide

This document outlines the coding standards and best practices for the nas-tools project.

projct facts:

- Language: typescript
- Package manager: bun
- nodejs: v20.x
- bun: v1.2.x

## Function Declarations

### Arrow Functions vs Named Functions

**Use arrow functions for:**

- Simple expressions that can use implicit returns
- Single-line operations
- Pure functions with no side effects
- Callback functions

```typescript
// ✅ Good - Simple expressions with implicit returns
export const isMusicFile = (file: string): boolean =>
  MUSIC_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext));

export const getDirname = (filePath: string): string => path.dirname(filePath);

export const logInfo = (message: string): void =>
  console.log(`${pc.blue("ℹ")} ${message}`);
```

**Use named functions for:**

- Functions with imperative control (async/await, multiple statements)
- Functions with complex logic or conditional returns
- Functions that perform side effects
- Functions that need to be hoisted

```typescript
// ✅ Good - Named functions for imperative control
export async function confirm(message: string): Promise<boolean> {
  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
    {
      type: "confirm",
      name: "proceed",
      message,
      default: true,
    },
  ]);
  return proceed;
}

export function displaySummary(
  successCount: number,
  failureCount: number,
  totalCount: number
): void {
  console.log(`\n${pc.bold(pc.blue("📊 Summary:"))}`);

  if (successCount > 0) {
    console.log(
      `${pc.green("✓")} Successfully moved: ${pc.bold(
        successCount.toString()
      )} albums`
    );
  }
  // ... more logic
}
```

### Return Statements

**Use implicit returns when possible:**

- Only use explicit `return` statements when necessary
- Prefer implicit returns for simple expressions

```typescript
// ✅ Good - Implicit return
export const readDirectory = async (dirPath: string): Promise<string[]> =>
  await fs.readdir(dirPath);

// ❌ Avoid - Unnecessary explicit return
export const readDirectory = async (dirPath: string): Promise<string[]> => {
  return await fs.readdir(dirPath);
};
```

## TypeScript Guidelines

### Type Annotations

- Always provide explicit return types for exported functions
- Use `void` for functions that don't return values
- Use `Promise<T>` for async functions

```typescript
// ✅ Good - Explicit types
export const isMusicFile = (file: string): boolean => /* ... */;
export async function moveFile(source: string, destination: string): Promise<void> { /* ... */ }
export function logInfo(message: string): void { /* ... */ }
```

### Constants and Imports

- Use `const` for all exports and constants
- Use `as const` for readonly arrays and objects
- Group imports by type (standard library, third-party, local)

```typescript
// ✅ Good - Organized imports
import * as fs from "fs/promises";
import * as path from "path";
import inquirer from "inquirer";
import type { Dirent } from "fs";
import pc from "picocolors";

// ✅ Good - Constants with proper typing
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

## File Organization

### Structure

- Group related functions together with clear section comments
- Use consistent spacing between sections
- Export all functions and constants at the top level

```typescript
// Common constants
export const FILE_EXTENSIONS = { /* ... */ };

// File system utilities
export const exists = async (path: string): Promise<boolean> => /* ... */;
export async function ensureDirectory(dirPath: string): Promise<void> { /* ... */ }

// File type checking utilities
export const isMusicFile = (file: string): boolean => /* ... */;

// User interaction utilities
export async function confirm(message: string): Promise<boolean> { /* ... */ }

// Logging utilities
export const logInfo = (message: string): void => /* ... */;
```

## Naming Conventions

### Functions

- Use camelCase for function names
- Use descriptive names that indicate the function's purpose
- Prefix boolean functions with `is`, `has`, `can`, etc.

```typescript
// ✅ Good - Descriptive names
export const isMusicFile = (file: string): boolean => /* ... */;
export const validateDirectory = async (dirPath: string): Promise<boolean> => /* ... */;
export const displaySummary = (successCount: number, failureCount: number): void => /* ... */;
```

### Variables

- Use camelCase for variable names
- Use descriptive names that indicate the variable's purpose
- Use `$` prefix for temporary variables that shadow other names

```typescript
// ✅ Good - Clear variable names
const { proceed } = await inquirer.prompt<{ proceed: boolean }>(/* ... */);
const $exists = await exists(dirPath); // Temporary variable with $ prefix
```

## Error Handling

### Async Functions

- Use try-catch blocks for error handling in async functions
- Return boolean values for validation functions
- Use descriptive error messages

```typescript
// ✅ Good - Proper error handling
export const exists = async (path: string): Promise<boolean> =>
  await fs
    .access(path)
    .then(() => true)
    .catch(() => false);

export async function validateDirectory(dirPath: string): Promise<boolean> {
  const $exists = await exists(dirPath);
  if (!$exists) {
    logError(`Directory '${dirPath}' does not exist or is not accessible`);
    return false;
  }
  return true;
}
```

## Comments and Documentation

### Section Comments

- Use clear section comments to group related functions
- Use consistent comment formatting

```typescript
// File system utilities
export const exists = async (path: string): Promise<boolean> => /* ... */;

// User interaction utilities
export async function confirm(message: string): Promise<boolean> { /* ... */ }

// Logging utilities
export const logInfo = (message: string): void => /* ... */;
```

## CLI-Specific Guidelines

### User Interaction

- Use inquirer for user prompts
- Provide default values where appropriate
- Use descriptive messages

```typescript
// ✅ Good - User-friendly prompts
export async function confirm(message: string): Promise<boolean> {
  const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
    {
      type: "confirm",
      name: "proceed",
      message,
      default: true,
    },
  ]);
  return proceed;
}
```

### Logging

- Use consistent logging functions with emojis for visual clarity
- Use appropriate colors for different message types
- Provide clear, actionable messages

```typescript
// ✅ Good - Consistent logging
export const logInfo = (message: string): void =>
  console.log(`${pc.blue("ℹ")} ${message}`);

export const logSuccess = (message: string): void =>
  console.log(`${pc.green("✓")} ${message}`);

export const logError = (message: string): void =>
  console.error(`${pc.red("✗")} ${message}`);
```

## Summary

This style guide ensures:

- **Consistency** across the codebase
- **Readability** through clear function declarations
- **Maintainability** through proper organization
- **Performance** through appropriate function choices
- **User Experience** through clear logging and interactions

Follow these guidelines to maintain high code quality and ensure the project remains maintainable as it grows.
