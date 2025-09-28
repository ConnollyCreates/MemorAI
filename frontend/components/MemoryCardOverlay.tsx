"use client";

import React from "react";

type Props = {
  name: string;
  relationship: string;
  caption?: string;           // "Remember:" text
  photoUrl?: string;          // most recent / featured photo
  photosCount?: number;       // optional: "3 photos stored"
  active?: boolean;           // shows AR ACTIVE pulse
  className?: string;         // extra Tailwind if needed
};

export default function MemoryCardOverlay({
  name,
  relationship,
  caption,
  photoUrl,
  photosCount,
  active = true,
  className = "",
}: Props) {
  return (
    <div
      className={[
        "pointer-events-none select-none",
        // Darker, footer-inspired palette with less transparency
        "bg-slate-900/85 backdrop-blur-sm border border-white/10",
        "rounded-3xl shadow-2xl p-5 sm:p-6",
        "w-[92vw] max-w-sm mx-auto",
        className,
      ].join(" ")}
      aria-live="polite"
    >
      {/* Photo */}
      <div className="text-center">
        <div className="w-28 h-28 sm:w-32 sm:h-32 mx-auto mb-3 rounded-2xl overflow-hidden border-4 border-cyan-300/50 shadow-lg">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt=""
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-white/10" />
          )}
        </div>

        {/* Person */}
        <h3 className="text-2xl sm:text-3xl font-bold text-cyan-100">{name}</h3>
        <div className="bg-cyan-400/15 rounded-full px-3 py-1 inline-block mt-2 border border-cyan-300/20">
          <p className="text-cyan-200 font-semibold capitalize">
            Your {relationship}
          </p>
        </div>

        {/* Caption */}
        {caption && (
          <div className="bg-slate-800/80 rounded-xl p-3 mt-4 text-left border border-white/10">
            <p className="text-xs text-cyan-300 font-medium mb-1">Remember:</p>
            <p className="text-cyan-100 text-sm leading-snug">{caption}</p>
          </div>
        )}

        {/* Footer row */}
        <div className="mt-4 flex items-center justify-between text-xs text-cyan-200/80">
          <div>{photosCount ? `${photosCount} photo${photosCount > 1 ? "s" : ""} stored` : "\u00A0"}</div>
          {active && (
            <div className="flex items-center gap-2 text-cyan-200">
              <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
              <span className="font-medium tracking-wide">AR RECOGNITION ACTIVE</span>
              <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
