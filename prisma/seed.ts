import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../src/generated/prisma";
import * as fs from "fs";
import * as path from "path";

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:dev.db" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter } as any);

interface EnrichedWord {
  word_id: number;
  word: string;
  furigana: string;
  meaning_zh: string;
  level: number;
  pos: string;
  example_sentences: object[];
  synonyms: string | null;
  pitch_accent: string | null;
  homophones: string | null;
  audio_file: string | null;
}

interface RawOption {
  text: string;
  text_plain?: string;
}

interface RawQuestion {
  id: string;
  word_id: number;
  dimension: string;
  type: string;
  question?: string;
  question_plain?: string;
  options: RawOption[];
  correct_index: number;
  explanation?: string;
  explanation_plain?: string;
  explanation_zh?: string;
}

function assertNoWordCollisions(words: EnrichedWord[]) {
  const seen = new Map<string, number>();
  const collisions: string[] = [];
  for (const w of words) {
    for (const wordForm of w.word.split(/[/／]/).map((s) => s.trim()).filter(Boolean)) {
      for (const furiganaForm of (w.furigana ?? "").split(/[/／]/).map((s) => s.trim()).filter(Boolean)) {
        const key = `${wordForm}|${furiganaForm}`;
        const prev = seen.get(key);
        if (prev !== undefined && prev !== w.word_id) {
          collisions.push(`"${wordForm}"（${furiganaForm}）: word_id ${prev} ↔ ${w.word_id}`);
        } else {
          seen.set(key, w.word_id);
        }
      }
    }
  }
  if (collisions.length > 0) {
    console.warn(
      `⚠ Duplicate word+furigana combinations in n2_words.json (proceeding — each has a unique word_id):\n  ${collisions.join("\n  ")}`
    );
  }
}

async function seedWords(words: EnrichedWord[]) {
  assertNoWordCollisions(words);
  console.log(`Seeding ${words.length} words...`);
  await prisma.word.deleteMany();
  await prisma.word.createMany({
    data: words.map((w) => ({
      id: w.word_id,
      word: w.word,
      furigana: w.furigana,
      meaningZh: w.meaning_zh || "",
      level: w.level,
      pos: w.pos || "",
      exampleSentences: JSON.stringify(w.example_sentences || []),
      synonyms: w.synonyms ?? "",
      pitchAccent: w.pitch_accent,
      homophones: w.homophones,
      audioFile: w.audio_file,
    })),
  });
  console.log(`✓ Seeded ${words.length} words`);
}

async function seedQuestions(questions: RawQuestion[]) {
  console.log(`Seeding ${questions.length} questions...`);
  await prisma.question.deleteMany();
  await prisma.question.createMany({
    data: questions.map((q) => ({
      id: q.id,
      wordId: q.word_id,
      dimension: q.dimension,
      type: q.type,
      question: q.question ?? null,
      options: JSON.stringify(q.options.map((o) => ({ text: o.text }))),
      correctIndex: q.correct_index,
      explanation: q.explanation || null,
      explanationZh: q.explanation_zh || null,
    })),
  });
  console.log(`✓ Seeded ${questions.length} questions`);
}

async function main() {
  const wordsPath = path.resolve(__dirname, "..", "n2_words.json");
  const questionsPath = path.resolve(__dirname, "..", "n2_questions.json");

  const words = JSON.parse(fs.readFileSync(wordsPath, "utf-8")) as EnrichedWord[];
  await seedWords(words);

  if (fs.existsSync(questionsPath)) {
    const questions = JSON.parse(fs.readFileSync(questionsPath, "utf-8")) as RawQuestion[];
    await seedQuestions(questions);
  } else {
    console.log("⚠ n2_questions.json not found, skipping question seed");
  }

  // Initialize default AppSettings
  await prisma.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });

  console.log("✓ Seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
