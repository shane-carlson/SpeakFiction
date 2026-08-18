import mark from '../assets/speakfiction-logo.png';

/** SpeakFiction mark: an open book with a speaking voice. */
export function Logo({ size = 34, title = 'SpeakFiction' }: { size?: number; title?: string }) {
  return (
    <img
      className="logo-mark"
      src={mark}
      width={size}
      height={size}
      alt={title}
      draggable={false}
    />
  );
}
