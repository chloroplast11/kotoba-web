"use client";
import { useAudio } from "@/hooks/useAudio";

interface Props {
  src?: string | (() => Promise<string>);
  fallbackText?: string;
  autoPlay?: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
  ariaLabel?: string;
}

export default function PlayButton({
  src,
  fallbackText,
  autoPlay,
  size = "md",
  label = "再生",
  ariaLabel,
}: Props) {
  const { play, state } = useAudio({ src, fallbackText, autoPlay });

  const dim = size === "sm" ? 16 : size === "lg" ? 24 : 20;
  const playing = state === "playing" || state === "loading";

  return (
    <button
      type="button"
      className="play-btn"
      aria-label={ariaLabel ?? label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        void play();
      }}
      data-state={state}
      style={{
        background: "none",
        border: "none",
        padding: size === "sm" ? "4px" : "6px",
        cursor: "pointer",
        color: playing ? "var(--ink)" : "var(--ink-faint)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "color 120ms ease",
      }}
    >
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {playing ? (
          <>
            <path d="M3 12a9 9 0 0 1 14-7.5" />
            <path d="M21 12a9 9 0 0 1-14 7.5" opacity="0.4" />
            <path d="M11 8l4 4-4 4" />
          </>
        ) : (
          <>
            <path d="M3 9v6h4l5 4V5L7 9H3z" />
            <path d="M16 7a6 6 0 0 1 0 10" opacity="0.55" />
            <path d="M19 4a10 10 0 0 1 0 16" opacity="0.3" />
          </>
        )}
      </svg>
    </button>
  );
}
