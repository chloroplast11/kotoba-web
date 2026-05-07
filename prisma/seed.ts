import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../src/generated/prisma";
import * as fs from "fs";
import * as path from "path";

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:dev.db" });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prisma = new PrismaClient({ adapter } as any);

interface EnrichedWord {
  word: string;
  furigana: string;
  romaji: string;
  meaning_zh: string;
  meaning_en: string;
  level: number;
  pos: string;
  frequency: string;
  example_sentences: object[];
  synonyms: string[];
  antonyms: string[];
  collocations: string[];
  usage_notes: string;
  word_id: number;
}

interface RawQuestion {
  id: string;
  word_id: number;
  dimension: string;
  type: string;
  question: string;
  question_plain: string;
  options: object[];
  correct_index: number;
  explanation?: string;
  explanation_plain?: string;
  explanation_zh?: string;
}

function normalizeFrequency(freq: string): string {
  return freq === "medium" ? "mid" : freq;
}

async function seedWords(words: EnrichedWord[]) {
  console.log(`Seeding ${words.length} words...`);
  await prisma.word.deleteMany();
  await prisma.word.createMany({
    data: words.map((w) => ({
      id: w.word_id,
      word: w.word,
      furigana: w.furigana,
      romaji: w.romaji,
      meaningZh: w.meaning_zh || "",
      meaningEn: w.meaning_en || "",
      level: w.level,
      pos: w.pos || "",
      frequency: normalizeFrequency(w.frequency || "mid"),
      usageNotes: w.usage_notes || "",
      exampleSentences: JSON.stringify(w.example_sentences || []),
      synonyms: JSON.stringify(w.synonyms || []),
      antonyms: JSON.stringify(w.antonyms || []),
      collocations: JSON.stringify(w.collocations || []),
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
      question: q.question,
      questionPlain: q.question_plain ?? "",
      options: JSON.stringify(q.options),
      correctIndex: q.correct_index,
      explanation: q.explanation || null,
      explanationPlain: q.explanation_plain || null,
      explanationZh: q.explanation_zh || null,
    })),
  });
  console.log(`✓ Seeded ${questions.length} questions`);
}

async function main() {
  const dataDir = path.join(__dirname, "..");
  const wordsPath = path.join(dataDir, "n2_enriched.json");
  const questionsPath = path.join(dataDir, "n2_questions.json");

  const words: EnrichedWord[] = JSON.parse(fs.readFileSync(wordsPath, "utf-8"));
  const questions: RawQuestion[] = JSON.parse(
    fs.readFileSync(questionsPath, "utf-8")
  );

  await seedWords(words);
  await seedQuestions(questions);

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
