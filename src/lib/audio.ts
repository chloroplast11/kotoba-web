export function getWordAudioUrl(wordId: number): string {
  return `/audio/words/${wordId}.mp3`;
}

export async function getSentenceAudioUrl(jaPlain: string): Promise<string> {
  const buf = new TextEncoder().encode(jaPlain);
  const digest = await crypto.subtle.digest("SHA-1", buf);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);
  return `/audio/sentences/${hex}.mp3`;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isAudioSupported(): boolean {
  return typeof window !== "undefined" && (typeof Audio !== "undefined" || isSpeechSynthesisSupported());
}
