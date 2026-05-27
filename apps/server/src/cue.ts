import { access, readdir } from "node:fs/promises";
import { join } from "node:path";

export type CuePair = {
  id: string;
  directory: string;
  cueFile: string;
  audioFile: string;
  blocked: boolean;
  risks: string[];
};

export type CueScanProgress = {
  scannedDirectories: number;
  foundPairs: number;
  message: string;
};

type EmitCueScanProgress = (progress: CueScanProgress) => void;

const audioPattern = /\.(flac|wav|wv)$/i;
const cuePattern = /\.cue$/i;

export async function findCuePairs(
  root: string,
  maxDepth: number,
  emit?: EmitCueScanProgress,
): Promise<CuePair[]> {
  const pairs: CuePair[] = [];
  let scannedDirectories = 0;

  async function visit(directory: string, depth: number): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    scannedDirectories++;

    const names = entries
      .filter((entry) => !entry.name.startsWith("._"))
      .map((entry) => entry.name);
    const cueFiles = names.filter((name) => cuePattern.test(name)).sort();
    const audioFiles = names.filter((name) => audioPattern.test(name)).sort();
    const blocked = names.includes("__temp_split");

    for (const cueFile of cueFiles) {
      const cueBase = baseName(cueFile);
      const audioFile = audioFiles.find((name) => baseName(name) === cueBase);
      if (!audioFile) continue;

      pairs.push({
        id: `${directory}/${cueFile}`,
        directory,
        cueFile,
        audioFile,
        blocked,
        risks: hasMultiDiscSignal(cueFile, audioFiles)
          ? ["multi-disc signal; verify disc boundaries before fixing"]
          : [],
      });
    }

    emit?.({
      scannedDirectories,
      foundPairs: pairs.length,
      message: `Scanned ${scannedDirectories} directories`,
    });

    if (depth >= maxDepth) return;

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "__temp_split") {
        continue;
      }
      await visit(join(directory, entry.name), depth + 1);
    }
  }

  await visit(root, 0);
  return pairs;
}

export async function pathExists(path: string): Promise<boolean> {
  return access(path)
    .then(() => true)
    .catch(() => false);
}

export async function getBashFunctionsPath(): Promise<string | undefined> {
  const candidates = [
    process.env.NAS_TOOLS_BASH_FUNCTIONS_PATH,
    join(process.cwd(), "bash/functions.sh"),
    join(process.cwd(), "../../bash/functions.sh"),
  ].filter((path): path is string => Boolean(path));

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  return undefined;
}

export async function splitCuePair(input: {
  pair: CuePair;
  bashFunctionsPath: string;
  onLine: (line: string) => void;
}): Promise<void> {
  const cuePath = join(input.pair.directory, input.pair.cueFile);
  const script = [
    `cd ${shellQuote(input.pair.directory)}`,
    `source ${shellQuote(input.bashFunctionsPath)}`,
    `split_cue_audio ${shellQuote(input.pair.cueFile)}`,
    `cleanup_temp_split ${shellQuote(cuePath)}`,
  ].join(" && ");

  const proc = Bun.spawn(["bash", "-lc", script], {
    stdout: "pipe",
    stderr: "pipe",
  });

  await Promise.all([
    streamLines(proc.stdout, input.onLine),
    streamLines(proc.stderr, (line) => input.onLine(`stderr: ${line}`)),
  ]);

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`split_cue_audio exited with ${exitCode}`);
  }
}

async function streamLines(stream: ReadableStream<Uint8Array>, onLine: (line: string) => void) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onLine(line);
    }
  }

  if (buffer.trim()) onLine(buffer);
}

function baseName(name: string): string {
  return name.replace(/\.(cue|flac|wav|wv)$/i, "").toLowerCase();
}

function hasMultiDiscSignal(cueFile: string, audioFiles: string[]): boolean {
  return (
    /\b(cd|disc|disk|act)\s*\d+\b/i.test(cueFile) ||
    audioFiles.filter((name) => /\b(cd|disc|disk|act)\s*\d+\b/i.test(name)).length > 1
  );
}

function shellQuote(value: string): string {
  return JSON.stringify(value);
}
