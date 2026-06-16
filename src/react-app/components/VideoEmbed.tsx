// Renders a reference video for an exercise. YouTube/Vimeo URLs embed as a 16:9 iframe;
// anything else falls back to a button that opens the link in a new tab.

// Prepend https:// when the stored URL has no protocol, so it never resolves
// as a relative SPA link (which would trigger a router 404).
export function normalize(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function embedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}?playsinline=1&rel=0` : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.split("/").filter(Boolean)[1];
        return id ? `https://www.youtube.com/embed/${id}?playsinline=1&rel=0` : null;
      }
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}?playsinline=1&rel=0` : null;
    }
    if (host === "vimeo.com") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function VideoEmbed({
  url: rawUrl,
  variant = "default",
}: {
  url: string;
  variant?: "default" | "full";
}) {
  const url = normalize(rawUrl);
  const embed = embedUrl(url);
  const isFull = variant === "full";

  if (embed) {
    return (
      <div style={{
        position: "relative", width: "100%",
        height: isFull ? "100%" : undefined,
        aspectRatio: isFull ? undefined : "16 / 9",
        borderRadius: isFull ? 0 : 14,
        overflow: "hidden",
        background: "rgba(0,0,0,0.30)",
        maxWidth: isFull ? undefined : 480,
        marginLeft: "auto", marginRight: "auto",
      }}>
        <iframe
          src={embed}
          title="Video del ejercicio"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "10px 18px", borderRadius: 999,
          border: "1.5px solid rgba(245,240,232,0.30)",
          color: "var(--bone)", textDecoration: "none",
          fontSize: 14, fontWeight: 600,
        }}
      >
        Ver video
      </a>
    </div>
  );
}
