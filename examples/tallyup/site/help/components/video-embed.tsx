// Renders a walkthrough's narrated video from page frontmatter (video/srt/vtt
// paths written by packages/engine/src/pages). Captions use the VTT track;
// SRT is offered as a download for editors/screen readers that prefer it.
// Chapters come from the walkthrough's `chapter` fields (see pages/content.ts
// chaptersOf) and are passed in as plain seconds/label pairs — no client JS
// beyond native <video> seeking.
"use client";

export interface VideoChapter {
  label: string;
  seconds: number;
}

export interface VideoEmbedProps {
  src: string;
  vtt?: string;
  srt?: string;
  poster?: string;
  chapters?: VideoChapter[];
  title?: string;
}

export function VideoEmbed({ src, vtt, srt, poster, chapters = [], title }: VideoEmbedProps) {
  return (
    <figure className="docgen-video not-prose my-6 print:hidden" aria-label={title}>
      <video controls preload="metadata" poster={poster} className="w-full rounded-lg border">
        <source src={src} type="video/mp4" />
        {vtt ? <track kind="captions" src={vtt} srcLang="en" label="English" default /> : null}
      </video>
      {(srt || chapters.length > 0) && (
        <figcaption className="mt-2 flex flex-wrap items-center gap-3 text-sm text-fd-muted-foreground">
          {srt ? (
            <a href={srt} download className="underline">
              Download captions (.srt)
            </a>
          ) : null}
          {chapters.length > 0 ? (
            <span className="flex flex-wrap gap-2">
              {chapters.map((c) => (
                <span key={c.label} className="rounded border px-2 py-0.5">
                  {c.label} · {Math.floor(c.seconds / 60)}:{String(Math.round(c.seconds % 60)).padStart(2, "0")}
                </span>
              ))}
            </span>
          ) : null}
        </figcaption>
      )}
    </figure>
  );
}
