type Props = { className?: string; tone?: "dark" | "light" };

// Display the supplied artwork unchanged. The SVG viewport excludes the
// surrounding canvas; blend modes adapt its black background to the surface.
export function BrandWordmark({ className = "", tone = "light" }: Props) {
  return <span className={`polka-wordmark ${className}`} data-tone={tone} role="img" aria-label="polka">
    <svg viewBox="312 496 670 252" aria-hidden="true" focusable="false">
      <image href="/brand/polka-wordmark.png" x="0" y="0" width="1280" height="1280" />
    </svg>
  </span>;
}
