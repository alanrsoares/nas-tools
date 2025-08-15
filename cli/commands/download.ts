import { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import { basename } from "node:path";

import { fetch } from "bun";

const DEFAULT_DEST = "/volmain/Download/ignore";
const DEFAULT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

interface DownloadOptions {
  referer?: string;
  cookie?: string;
  dest: string;
  ua: string;
  retries: number;
  timeout: number;
}

function filenameFromHeaders(url: string, headers: Headers): string {
  const cd = headers.get("content-disposition");
  if (cd) {
    // Try RFC 5987 (filename*=UTF-8'')
    const star = cd.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i);
    if (star && star[1]) {
      return decodeURIComponent(star[1].replace(/^["']|["']$/g, "").trim());
    }
    // Fallback: filename="..."
    const plain = cd.match(/filename\s*=\s*("?)([^";]+)\1/i);
    if (plain && plain[2]) {
      try {
        return decodeURIComponent(plain[2]);
      } catch {
        return plain[2];
      }
    }
  }
  return basename(new URL(url).pathname) || "download.bin";
}

async function fetchOnce(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs).unref?.();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(t as any);
  }
}

async function downloadFile(
  url: string,
  options: DownloadOptions
): Promise<void> {
  await mkdir(options.dest, { recursive: true });

  const headers: Record<string, string> = {
    "User-Agent": options.ua,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    // fetch() handles compression automatically; sending Accept-Encoding
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

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const filename = filenameFromHeaders(url, res.headers);
      const filePath = `${options.dest}/${filename}`;
      console.log(`→ Saving as ${filePath}`);

      // Convert response to buffer and write to disk
      const buffer = await res.arrayBuffer();
      await writeFile(filePath, Buffer.from(buffer));
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

export function downloadCommand(program: Command): void {
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
    .action(async (url: string, options: any) => {
      const downloadOptions: DownloadOptions = {
        dest: options.dest,
        referer: options.referer,
        cookie: options.cookie,
        ua: options.ua,
        retries: parseInt(options.retries),
        timeout: parseInt(options.timeout),
      };

      try {
        await downloadFile(url, downloadOptions);
      } catch (error) {
        console.error(`Download failed: ${error}`);
        process.exit(1);
      }
    });
}
