"use client";
import { useRouter } from "next/navigation";
import type { ExampleSentence } from "@/types/domain";
import RubyText from "@/components/ui/RubyText";
import PlayButton from "@/components/ui/PlayButton";
import { getCurrentTime } from "@/lib/time";
import { getWordAudioUrl, getSentenceAudioUrl } from "@/lib/audio";

export interface WordData {
  id: number;
  word: string;
  furigana: string;
  meaningZh: string;
  pos: string;
  level: number;
  pitchAccent: string | null;
  homophones: string | null;
  exampleSentences: ExampleSentence[];
  synonyms: string[];
}

export function WordEntryBody({
  word,
  autoPlay = true,
}: {
  word: WordData;
  autoPlay?: boolean;
}) {
  return (
    <article className="entry" style={{ borderBottom: "none" }}>
      <div className="entry-head">
        <div className="entry-furigana">
          {word.furigana}
          {word.pitchAccent && (
            <span className="ml-2 text-sm text-zinc-500" title="アクセント">
              {word.pitchAccent}
            </span>
          )}
        </div>
        <div className="entry-word" style={{ display: "flex", alignItems: "center", gap: "10px", justifyContent: "center" }}>
          <span>{word.word}</span>
          <PlayButton
            src={getWordAudioUrl(word.id)}
            fallbackText={word.word}
            autoPlay={autoPlay}
            size="lg"
            label="再生"
            ariaLabel={`「${word.word}」を再生`}
          />
        </div>
        <div className="tag-row">
          <span className="tag">{word.pos}</span>
          <span className="tag">N{word.level}</span>
        </div>
      </div>

      <div className="entry-body">
        <div className="entry-meaning">
          {word.meaningZh}
        </div>

        {word.exampleSentences.length > 0 && (
          <>
            <div className="subhead">例文</div>
            {word.exampleSentences.map((ex, i) => (
              <div className="example" key={i}>
                <div className="example-jp" style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <span style={{ flex: 1 }}><RubyText html={ex.ja} /></span>
                  <PlayButton
                    src={() => getSentenceAudioUrl(ex.ja_plain)}
                    fallbackText={ex.ja_plain}
                    size="sm"
                    label="再生"
                    ariaLabel="例文を再生"
                  />
                </div>
                <div className="example-zh">{ex.zh}</div>
              </div>
            ))}
          </>
        )}

        {word.synonyms.length > 0 && (
          <>
            <div className="subhead">近義語</div>
            {word.synonyms.map((s, i) => (
              <div className="synonym" key={i}>
                <div className="synonym-word">{s}</div>
              </div>
            ))}
          </>
        )}

        {word.homophones && (
          <section>
            <div className="subhead">同音語</div>
            <p className="mt-1 text-sm whitespace-pre-wrap">{word.homophones}</p>
          </section>
        )}
      </div>
    </article>
  );
}

export default function WordEntry({
  word,
  fromLibrary = false,
}: {
  word: WordData;
  fromLibrary?: boolean;
}) {
  const router = useRouter();

  async function handleGotIt() {
    await fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wordId: word.id,
        dimension: "R",
        questionId: "__learn__",
        correct: true,
        timestamp: getCurrentTime(),
        learnOnly: true,
      }),
    });
    router.push("/practice");
  }

  return (
    <div>
      <WordEntryBody word={word} />

      <div className="learn-nav">
        {fromLibrary ? (
          <button className="btn" onClick={() => router.push(`/practice/word/${word.id}`)}>
            練習する →
          </button>
        ) : (
          <>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-faint)" }}>
              よく読んでください — この単語は今日ここにしか全文で現れません。
            </span>
            <button className="btn" onClick={handleGotIt}>
              理解した — 練習へ →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
