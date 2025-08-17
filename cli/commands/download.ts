import { mkdir, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { Command } from "commander";
import got, { type Headers, type Response } from "got";
import { Maybe } from "true-myth";
import { z } from "zod";

const DEFAULT_DEST = "/volmain/Download/ignore";
const DEFAULT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const optionsSchema = z.object({
  referer: z.string().optional(),
  cookie: z.string().optional(),
  dest: z.string(),
  ua: z.string(),
  retries: z.string().transform((val) => parseInt(val, 10)),
  timeout: z.string().transform((val) => parseInt(val, 10)),
});

type CommandOptions = z.infer<typeof optionsSchema>;

const RFC5987_RE = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i;
const RFC5987_RE_2 = /filename\s*=\s*("?)([^";]+)\1/i;

function filenameFromHeaders(url: string, headers: Headers): string {
  const fallbackName = basename(new URL(url).pathname) || "download.bin";

  const cd = headers["content-disposition"];
  if (!cd) {
    return fallbackName;
  }

  const cdStr = Maybe.of(Array.isArray(cd) ? cd[0] : cd);
  if (cdStr.isNothing) {
    return fallbackName;
  }

  // Try RFC 5987 (filename*=UTF-8'')
  const star = Maybe.of(cdStr.value.match(RFC5987_RE)?.[1]);
  if (star.isJust) {
    return decodeURIComponent(star.value.replace(/^["']|["']$/g, "").trim());
  }

  // Fallback: filename="..."
  const plain = Maybe.of(cdStr.value.match(RFC5987_RE_2)?.[2]);

  return plain.mapOr(fallbackName, (p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
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

async function run(url: string, options: CommandOptions): Promise<void> {
  await mkdir(options.dest, { recursive: true });

  const headers: Record<string, string> = {
    "User-Agent": options.ua,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    // got handles compression automatically; sending Accept-Encoding
    // explicitly can sometimes confuse certain servers, so we omit it.
  };
  if (options.referer) headers["Referer"] = options.referer;
  if (options.cookie) headers["Cookie"] = options.cookie;

  let attempt = 0;

  while (attempt <= options.retries) {
    try {
      if (attempt > 0) {
        console.log(`Retry ${attempt}/${options.retries}…`);
        await new Promise((r) => setTimeout(r, 500 * attempt)); // tiny backoff
      }
      console.log(`📥 GET ${url}`);
      const res = await fetchOnce(url, headers, options.timeout);

      if (res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error(`HTTP ${res.statusCode} ${res.statusMessage}`);
      }

      const filename = filenameFromHeaders(url, res.headers);
      const filePath = `${options.dest}/${filename}`;
      console.log(`→ Saving as ${filePath}`);

      // Write response body directly to disk
      await writeFile(filePath, res.rawBody);
      console.log("✅ Done");
      return;
    } catch (err) {
      attempt++;
      if (attempt > options.retries) {
        console.error(`❌ Failed after ${options.retries} retries: ${err}`);
        throw err;
      }
    }
  }
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
      try {
        await run(url, optionsSchema.parse(options));
      } catch (error) {
        console.error(`Download failed: ${error}`);
        process.exit(1);
      }
    });
}
