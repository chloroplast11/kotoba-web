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
  romaji: string;
  meaningZh: string;
  meaningEn: string;
  pos: string;
  level: number;
  frequency: string;
  usageNotes: string;
  exampleSentences: ExampleSentence[];
  synonyms: string[];
  collocations: string[];
}

const FREQ_LABELS: Record<string, string> = {
  high: "頻出",
  mid: "中頻",
  low: "低頻",
};

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
        <div className="entry-furigana">{word.furigana}</div>
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
        <div className="entry-romaji">{word.romaji}</div>
        <div className="tag-row">
          <span className="tag">{word.pos}</span>
          <span className={`tag freq-${word.frequency}`}>{FREQ_LABELS[word.frequency] ?? word.frequency}</span>
          <span className="tag">N{word.level}</span>
        </div>
      </div>

      <div className="entry-body">
        <div className="entry-meaning">
          {word.meaningZh}
          <span className="en">{word.meaningEn}</span>
        </div>

        {word.usageNotes && (
          <>
            <div className="subhead">使い方 · 用法</div>
            <div className="usage-note"><RubyText html={word.usageNotes} /></div>
          </>
        )}

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

        {word.collocations.length > 0 && (
          <>
            <div className="subhead">よく使う表現</div>
            <div className="colloc-list">
              {word.collocations.map((c, i) => (
                <div className="colloc" key={i}>
                  <span className="colloc-jp">{c}</span>
                </div>
              ))}
            </div>
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
