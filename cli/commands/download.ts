import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fromNullable, isNone } from "@onrails/maybe";
import {
  err,
  fromResult,
  ok,
  pipe,
  type Result,
  type ResultAsync,
  unwrapOr,
} from "@onrails/result";
import type { Command } from "commander";
import got, { type Headers, type Response } from "got";
import { z } from "zod";

import { fail, formatError, runParsedCommand, safe, safeAsync } from "../lib/fp.js";

const DEFAULT_DEST = "/volmain/Download/ignore";
const DEFAULT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const optionsSchema = z.object({
  referer: z.string().optional(),
  cookie: z.string().optional(),
  dest: z.string(),
  ua: z.string(),
  retries: z.coerce.number().int().min(0),
  timeout: z.coerce.number().int().positive(),
});

type CommandOptions = z.infer<typeof optionsSchema>;

const RFC5987_RE = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i;
const RFC5987_RE_2 = /filename\s*=\s*("?)([^";]+)\1/i;

const decodeFilename = (value: string): string =>
  unwrapOr(
    safe(() => decodeURIComponent(value), "Failed to decode filename"),
    value,
  );

function sanitizeFilename(filename: string, fallbackName: string): string {
  const sanitized = basename(filename.replace(/\\/g, "/")).trim();
  return sanitized && sanitized !== "." && sanitized !== ".." ? sanitized : fallbackName;
}

function parseContentDisposition(
  cd: string | string[] | undefined,
  fallbackName: string,
): Result<string, ReturnType<typeof fail>> {
  const header = pipe(cd, (raw) => fromNullable(Array.isArray(raw) ? raw[0] : raw));
  if (isNone(header)) {
    return ok(fallbackName);
  }

  const star = header.value.match(RFC5987_RE)?.[1];
  if (star) {
    const trimmed = star.replace(/^["']|["']$/g, "").trim();
    return ok(sanitizeFilename(decodeFilename(trimmed), fallbackName));
  }

  const plain = header.value.match(RFC5987_RE_2)?.[2];
  return plain ? ok(sanitizeFilename(decodeFilename(plain), fallbackName)) : ok(fallbackName);
}

function filenameFromHeaders(
  url: string,
  headers: Headers,
): Result<string, ReturnType<typeof fail>> {
  const fallbackName = sanitizeFilename(decodeFilename(new URL(url).pathname), "download.bin");
  const cd = headers["content-disposition"];
  return cd ? parseContentDisposition(cd, fallbackName) : ok(fallbackName);
}

function validateResponse(res: Response): Result<Response, ReturnType<typeof fail>> {
  if (res.statusCode >= 200 && res.statusCode < 300) {
    return ok(res);
  }
  return err(fail(`HTTP ${res.statusCode} ${res.statusMessage}`));
}

async function fetchOnce(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<Response> {
  return got(url, {
    method: "GET",
    headers,
    timeout: {
      request: timeoutMs,
    },
    followRedirect: true,
  });
}

function buildHeaders(options: CommandOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": options.ua,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
  };
  if (options.referer) headers.Referer = options.referer;
  if (options.cookie) headers.Cookie = options.cookie;

  return headers;
}

function run(url: string, options: CommandOptions): ResultAsync<void, ReturnType<typeof fail>> {
  const headers = buildHeaders(options);
  let attempt = 0;

  const download = (): ResultAsync<void, ReturnType<typeof fail>> => {
    return safeAsync(async () => {
      if (attempt > 0) {
        console.log(`Retry ${attempt}/${options.retries}…`);
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
      console.log(`📥 GET ${url}`);
      return await fetchOnce(url, headers, options.timeout);
    }, "Download request failed")
      .andThen((res) => validateResponse(res))
      .andThen((res) =>
        fromResult(filenameFromHeaders(url, res.headers)).flatMap((filename) => {
          const filePath = join(options.dest, filename);
          console.log(`→ Saving as ${filePath}`);

          return safeAsync(() => writeFile(filePath, res.rawBody), `Failed to write ${filePath}`);
        }),
      )
      .orElse((error) => {
        attempt++;
        if (attempt > options.retries) {
          return err(fail(`Failed after ${options.retries} retries`, error));
        }

        return download();
      });
  };

  return (
    safeAsync(
      () => mkdir(options.dest, { recursive: true }),
      `Failed to create destination ${options.dest}`,
    )
      .andThen(download)
      // biome-ignore lint/suspicious/useIterableCallbackReturn: Result.map for terminal side effect
      .map(() => {
        console.log("✅ Done");
      })
  );
}

export default function downloadCommand(program: Command): void {
  program
    .command("download")
    .description("Download a file from a URL")
    .argument("<url>", "URL to download")
    .option("-d, --dest <path>", "Destination directory", DEFAULT_DEST)
    .option("-r, --referer <url>", "Referer header")
    .option("-c, --cookie <string>", "Cookie header")
    .option("-u, --ua <string>", "User-Agent header", DEFAULT_UA)
    .option("--retries <number>", "Number of retries", "3")
    .option("--timeout <ms>", "Timeout in milliseconds", "30000")
    .action(async (url: string, options: Record<string, unknown>) => {
      await runParsedCommand(
        optionsSchema,
        options,
        "Invalid download options",
        (parsedOptions) => run(url, parsedOptions),
        (error) => {
          console.error(`Download failed: ${formatError(error)}`);
          process.exit(1);
        },
      );
    });
}
