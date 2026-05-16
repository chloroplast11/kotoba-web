"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import LibCard from "./LibCard";
import WordDetailDrawer from "./WordDetailDrawer";
import {
  LIBRARY_BUCKETS,
  type BucketKey,
  type LibraryItem,
  type LibraryResult,
} from "@/lib/library-query";
import type { DimKey, SrsData } from "@/types/domain";

const BUCKET_TITLES: Record<BucketKey, string> = {
  mastered: "習得済み",
  learned: "学習済み",
  notYet: "未学習",
};

interface Props {
  initial: LibraryResult;
  pageSize: number;
}

function buildParams(
  q: string,
  pageSize: number,
  pages: Record<BucketKey, number>
): string {
  const params = new URLSearchParams({ q, pageSize: String(pageSize) });
  for (const key of LIBRARY_BUCKETS) params.set(`p_${key}`, String(pages[key]));
  return params.toString();
}

function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (p: number) => void;
}) {
  if (total <= 1) return null;
  return (
    <div className="lib-pager">
      <button
        className="lib-pager-btn"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        前へ
      </button>
      <span className="lib-pager-indicator">
        {page} / {total}
      </span>
      <button
        className="lib-pager-btn"
        onClick={() => onChange(page + 1)}
        disabled={page >= total}
      >
        次へ
      </button>
    </div>
  );
}

export default function LibraryGrid({ initial, pageSize }: Props) {
  const [data, setData] = useState<LibraryResult>(initial);
  const [query, setQuery] = useState("");
  const [pages, setPages] = useState<Record<BucketKey, number>>({
    mastered: 1,
    learned: 1,
    notYet: 1,
  });
  const [selectedWord, setSelectedWord] = useState<LibraryItem | null>(null);
  const [loading, setLoading] = useState(false);

  const didMount = useRef(false);

  const fetchData = useCallback(
    async (
      q: string,
      nextPages: Record<BucketKey, number>,
      signal?: AbortSignal
    ): Promise<LibraryResult | null> => {
      const res = await fetch(
        `/api/library?${buildParams(q, pageSize, nextPages)}`,
        { signal }
      );
      if (!res.ok) return null;
      return (await res.json()) as LibraryResult;
    },
    [pageSize]
  );

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const ac = new AbortController();
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const json = await fetchData(query, pages, ac.signal);
        if (!cancelled && json) setData(json);
      } catch {
        // aborted or network error
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
      ac.abort();
    };
  }, [query, pages, fetchData]);

  function onQueryChange(v: string) {
    setQuery(v);
    setPages({ mastered: 1, learned: 1, notYet: 1 });
  }

  function onPageChange(key: BucketKey, p: number) {
    setPages((prev) => ({ ...prev, [key]: p }));
  }

  async function refreshAfterMasteryChange() {
    const json = await fetchData(query, pages);
    if (json) setData(json);

    if (selectedWord) {
      try {
        const r = await fetch(`/api/mastery?wordId=${selectedWord.id}`);
        if (r.ok) {
          const payload = (await r.json()) as {
            dimStates: Record<DimKey, SrsData | null>;
          };
          setSelectedWord((prev) =>
            prev ? { ...prev, dimStates: payload.dimStates } : prev
          );
        }
      } catch {
        // ignore
      }
    }
  }

  const totalFiltered = useMemo(
    () => LIBRARY_BUCKETS.reduce((sum, k) => sum + data[k].total, 0),
    [data]
  );

  return (
    <>
      <div className="lib-search">
        <input
          type="text"
          className="lib-search-input"
          placeholder="単語を検索…"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
      </div>

      {query.trim() && totalFiltered === 0 && !loading && (
        <div className="lib-empty">該当する単語がありません</div>
      )}

      {LIBRARY_BUCKETS.map((key) => {
        const bucket = data[key];
        if (bucket.total === 0) return null;
        const totalPages = Math.max(1, Math.ceil(bucket.total / pageSize));
        return (
          <section key={key}>
            <div className="section-head">
              <h2>{BUCKET_TITLES[key]}</h2>
              <span className="meta">{bucket.total} 語</span>
            </div>
            <div className="lib-grid">
              {bucket.items.map((w) => (
                <LibCard
                  key={w.id}
                  data={w}
                  onSelect={() => setSelectedWord(w)}
                />
              ))}
            </div>
            <Pager
              page={bucket.page}
              total={totalPages}
              onChange={(p) => onPageChange(key, p)}
            />
          </section>
        );
      })}

      {selectedWord && (
        <WordDetailDrawer
          word={selectedWord}
          onClose={() => setSelectedWord(null)}
          onChanged={refreshAfterMasteryChange}
        />
      )}
    </>
  );
}
