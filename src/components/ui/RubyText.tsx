interface Props {
  html: string;
  className?: string;
}

// Renders pre-built HTML containing <ruby> tags safely.
// The content comes from our own DB (not user input), so dangerouslySetInnerHTML is acceptable.
export default function RubyText({ html, className }: Props) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
