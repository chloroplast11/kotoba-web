"use client";

interface StepperProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
}

export default function Stepper({ value, min, max, step = 1, onChange }: StepperProps) {
  const dec = () => {
    const next = Math.max(min, value - step);
    if (next !== value) onChange(next);
  };
  const inc = () => {
    const next = Math.min(max, value + step);
    if (next !== value) onChange(next);
  };
  return (
    <div className="stepper" role="group" aria-label="数值调节">
      <button
        type="button"
        className="stepper-btn"
        onClick={dec}
        disabled={value <= min}
        aria-label="减少"
      >
        −
      </button>
      <span className="stepper-value">{value}</span>
      <button
        type="button"
        className="stepper-btn"
        onClick={inc}
        disabled={value >= max}
        aria-label="增加"
      >
        +
      </button>
    </div>
  );
}
