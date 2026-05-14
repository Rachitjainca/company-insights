"use client";

import { useEffect, useState } from "react";
import { getCompanyLogoCandidates } from "@/lib/company-brand";

interface CompanyLogoProps {
  symbol: string;
  name: string;
  /** Tailwind class for the wrapper (controls size + radius). */
  className?: string;
  /** Initials shown when no logo can be loaded. Defaults to first 2 chars of symbol. */
  fallbackInitials?: string;
}

/**
 * Renders a company logo with graceful fallback.
 *
 * Tries each candidate URL from `getCompanyLogoCandidates` in order
 * (Clearbit -> Google favicons), then falls back to an initials block.
 * Image load failures advance to the next candidate; final failure
 * shows initials. This is purely a presentational component.
 */
export default function CompanyLogo({
  symbol,
  name,
  className = "w-12 h-12 rounded-xl",
  fallbackInitials,
}: CompanyLogoProps) {
  const [candidates, setCandidates] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setCandidates(getCompanyLogoCandidates(symbol, name));
    setIdx(0);
    setFailed(false);
  }, [symbol, name]);

  const initials = (fallbackInitials || symbol.slice(0, 2)).toUpperCase();
  const showImage = !failed && candidates.length > 0 && idx < candidates.length;

  return (
    <div
      className={`relative overflow-hidden flex items-center justify-center bg-gradient-to-br from-indigo-600 to-blue-700 text-white font-semibold text-sm shrink-0 shadow-sm ring-1 ring-inset ring-white/15 tracking-tight ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={candidates[idx]}
          src={candidates[idx]}
          alt={`${name} logo`}
          className="absolute inset-0 w-full h-full object-contain bg-white p-1.5"
          referrerPolicy="no-referrer"
          onError={() => {
            if (idx + 1 < candidates.length) {
              setIdx(idx + 1);
            } else {
              setFailed(true);
            }
          }}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  );
}
