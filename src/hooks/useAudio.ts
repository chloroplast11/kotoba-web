"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { isSpeechSynthesisSupported } from "@/lib/audio";

export type AudioState = "idle" | "loading" | "playing" | "error" | "unsupported";

interface UseAudioOptions {
  src?: string | (() => Promise<string>);
  fallbackText?: string;
  lang?: string;
  autoPlay?: boolean;
}

const audioCache = new Map<string, HTMLAudioElement>();

function speak(text: string, lang: string, onEnd: () => void, onError: () => void) {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.onend = onEnd;
  u.onerror = onError;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

export function useAudio({ src, fallbackText, lang = "ja-JP", autoPlay }: UseAudioOptions) {
  const [state, setState] = useState<AudioState>("idle");
  const stateRef = useRef(state);
  stateRef.current = state;

  const isSupported =
    typeof window !== "undefined" && (typeof Audio !== "undefined" || isSpeechSynthesisSupported());

  const fallbackToSpeech = useCallback(() => {
    if (!fallbackText || !isSpeechSynthesisSupported()) {
      setState("error");
      return;
    }
    setState("playing");
    speak(
      fallbackText,
      lang,
      () => setState("idle"),
      () => setState("error")
    );
  }, [fallbackText, lang]);

  const play = useCallback(async () => {
    if (!isSupported) {
      setState("unsupported");
      return;
    }
    setState("loading");

    let resolvedSrc: string | undefined;
    try {
      resolvedSrc = typeof src === "function" ? await src() : src;
    } catch {
      resolvedSrc = undefined;
    }

    if (!resolvedSrc) {
      fallbackToSpeech();
      return;
    }

    let audio = audioCache.get(resolvedSrc);
    if (!audio) {
      audio = new Audio(resolvedSrc);
      audioCache.set(resolvedSrc, audio);
    }
    audio.currentTime = 0;

    const onEnded = () => setState("idle");
    const onError = () => {
      console.warn(`[useAudio] mp3 unavailable (${resolvedSrc}), falling back to Web Speech`);
      audioCache.delete(resolvedSrc!);
      fallbackToSpeech();
    };

    audio.removeEventListener("ended", onEnded);
    audio.removeEventListener("error", onError);
    audio.addEventListener("ended", onEnded, { once: true });
    audio.addEventListener("error", onError, { once: true });

    try {
      setState("playing");
      await audio.play();
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === "NotAllowedError" || name === "AbortError") {
        setState("idle");
        return;
      }
      onError();
    }
  }, [src, fallbackToSpeech, isSupported]);

  useEffect(() => {
    if (!autoPlay) return;
    void play();
  }, [autoPlay, play]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && isSpeechSynthesisSupported()) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { play, state, isSupported };
}
