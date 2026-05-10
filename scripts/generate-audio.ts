import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../src/generated/prisma";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

type Manifest = {
  entries: Record<string, { voice: string; at: string }>;
  failed: Record<string, { voice: string; error: string; at: string }>;
};

type Job = {
  key: string;
  text: string;
  outPath: string;
};

const PUBLIC_AUDIO = path.resolve(__dirname, "..", "public", "audio");
const WORDS_DIR = path.join(PUBLIC_AUDIO, "words");
const SENTENCES_DIR = path.join(PUBLIC_AUDIO, "sentences");
const MANIFEST_PATH = path.join(PUBLIC_AUDIO, "manifest.json");
const FLUSH_EVERY = 50;
const CONCURRENCY = 4;
const MAX_RETRIES = 2;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    force: false,
    limit: Infinity as number,
    voice: "ja-JP-NanamiNeural",
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--force") opts.force = true;
    else if (a === "--limit") opts.limit = parseInt(args[++i], 10);
    else if (a === "--voice") opts.voice = args[++i];
  }
  return opts;
}

function loadManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) return { entries: {}, failed: {} };
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8"));
  } catch {
    return { entries: {}, failed: {} };
  }
}

function saveManifest(m: Manifest) {
  const tmp = MANIFEST_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
  fs.renameSync(tmp, MANIFEST_PATH);
}

function sentenceHash(jaPlain: string): string {
  return crypto.createHash("sha1").update(jaPlain).digest("hex").slice(0, 12);
}

function ensureDirs() {
  for (const d of [PUBLIC_AUDIO, WORDS_DIR, SENTENCES_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

async function synthesize(tts: MsEdgeTTS, text: string, outPath: string): Promise<void> {
  const tmp = outPath + ".tmp";
  const { audioStream } = tts.toStream(text);
  const out = fs.createWriteStream(tmp);
  await new Promise<void>((resolve, reject) => {
    audioStream.pipe(out);
    out.once("close", () => {
      if (out.bytesWritten > 0) resolve();
      else reject(new Error("empty audio response"));
    });
    out.once("error", reject);
    audioStream.once("error", reject);
  });
  fs.renameSync(tmp, outPath);
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < MAX_RETRIES) {
        const delay = 500 * Math.pow(2, i);
        console.warn(`  ↻ ${label} retry ${i + 1}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

async function buildJobs(): Promise<Job[]> {
  const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:dev.db" });
  const prisma = new PrismaClient({ adapter } as never);
  const words = await prisma.word.findMany({ select: { id: true, word: true, exampleSentences: true } });
  await prisma.$disconnect();

  const jobs: Job[] = [];
  const seenSentenceKeys = new Set<string>();

  for (const w of words) {
    jobs.push({
      key: `words/${w.id}`,
      text: w.word,
      outPath: path.join(WORDS_DIR, `${w.id}.mp3`),
    });

    let parsed: Array<{ ja_plain?: string }> = [];
    try {
      parsed = JSON.parse(w.exampleSentences || "[]");
    } catch {
      parsed = [];
    }
    for (const s of parsed) {
      const text = s.ja_plain?.trim();
      if (!text) continue;
      const hash = sentenceHash(text);
      const key = `sentences/${hash}`;
      if (seenSentenceKeys.has(key)) continue;
      seenSentenceKeys.add(key);
      jobs.push({
        key,
        text,
        outPath: path.join(SENTENCES_DIR, `${hash}.mp3`),
      });
    }
  }
  return jobs;
}

async function runWorkers(jobs: Job[], voice: string, manifest: Manifest, force: boolean) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  let done = 0;
  let skipped = 0;
  let failed = 0;
  let processedSinceFlush = 0;
  const total = jobs.length;
  const startedAt = Date.now();

  let interrupted = false;
  const onSig = () => {
    if (!interrupted) {
      interrupted = true;
      console.log("\n⚠️  interrupted, flushing manifest...");
    }
  };
  process.on("SIGINT", onSig);
  process.on("SIGTERM", onSig);

  const queue = [...jobs];
  async function worker() {
    while (queue.length > 0 && !interrupted) {
      const job = queue.shift();
      if (!job) break;

      const existing = manifest.entries[job.key];
      const fileExists = fs.existsSync(job.outPath);
      if (!force && existing && existing.voice === voice && fileExists) {
        skipped++;
        continue;
      }

      try {
        await withRetry(() => synthesize(tts, job.text, job.outPath), job.key);
        manifest.entries[job.key] = { voice, at: new Date().toISOString() };
        delete manifest.failed[job.key];
        done++;
      } catch (e) {
        failed++;
        manifest.failed[job.key] = {
          voice,
          error: e instanceof Error ? e.message : String(e),
          at: new Date().toISOString(),
        };
        console.error(`  ✗ ${job.key}: ${e instanceof Error ? e.message : e}`);
      }

      processedSinceFlush++;
      if (processedSinceFlush >= FLUSH_EVERY) {
        saveManifest(manifest);
        processedSinceFlush = 0;
      }

      const finished = done + skipped + failed;
      if (finished % 10 === 0 || finished === total) {
        const pct = ((finished / total) * 100).toFixed(1);
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        process.stdout.write(
          `\r  [${pct}%] ${finished}/${total}  done=${done} skip=${skipped} fail=${failed}  ${elapsed}s   `
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  saveManifest(manifest);
  process.stdout.write("\n");

  process.off("SIGINT", onSig);
  process.off("SIGTERM", onSig);

  return { done, skipped, failed, interrupted };
}

async function main() {
  const opts = parseArgs();
  console.log(`🎙  edge-tts batch · voice=${opts.voice} force=${opts.force} limit=${opts.limit}`);

  ensureDirs();
  const manifest = loadManifest();

  let jobs = await buildJobs();
  console.log(`  Total jobs: ${jobs.length} (${jobs.filter((j) => j.key.startsWith("words/")).length} words + ${jobs.filter((j) => j.key.startsWith("sentences/")).length} sentences)`);
  if (Number.isFinite(opts.limit)) jobs = jobs.slice(0, opts.limit);

  const result = await runWorkers(jobs, opts.voice, manifest, opts.force);

  console.log(`\n✓ done=${result.done}  ⊝ skipped=${result.skipped}  ✗ failed=${result.failed}`);
  if (result.interrupted) {
    console.log("(interrupted — re-run to resume)");
    process.exit(130);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
