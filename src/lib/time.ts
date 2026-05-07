// All current-time references must go through getCurrentTime() so the
// developer-mode time-advance feature works correctly.
let _timeOffset = 0;

export function setTimeOffset(ms: number) {
  _timeOffset = ms;
}

export function getTimeOffset(): number {
  return _timeOffset;
}

export function getCurrentTime(): number {
  return Date.now() + _timeOffset;
}

export function getCurrentDate(): Date {
  return new Date(getCurrentTime());
}

export function todayDateString(): string {
  return new Date(getCurrentTime()).toISOString().slice(0, 10);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
