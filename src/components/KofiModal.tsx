"use client";

import React, { useEffect, useRef, useState } from "react";
import { Coffee, ExternalLink, Loader2, X } from "lucide-react";

interface KofiModalProps {
  isOpen: boolean;
  onClose: () => void;
  username?: string;
}

export default function KofiModal({
  isOpen,
  onClose,
  username = "ongyiumark",
}: KofiModalProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    triggerElementRef.current = document.activeElement as HTMLElement | null;
    setIsLoading(true);
    setIsTimedOut(false);

    const loadTimer = window.setTimeout(() => {
      setIsTimedOut(true);
    }, 8000);

    const modal = modalRef.current;
    if (modal) {
      const focusables = modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], iframe, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length > 0) {
        focusables[0].focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && modal) {
        const focusables = modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], iframe, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(loadTimer);
      window.removeEventListener("keydown", handleKeyDown);
      if (
        triggerElementRef.current &&
        document.body.contains(triggerElementRef.current)
      ) {
        triggerElementRef.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Clean iframe embed without preview wrappers or awkward letterboxing
  const kofiEmbedUrl = `https://ko-fi.com/${username}/?hidefeed=true&widget=true&embed=true`;
  const kofiDirectUrl = `https://ko-fi.com/${username}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kofi-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-2.5 sm:p-4 bg-black/80 backdrop-blur-sm overscroll-contain animate-in fade-in duration-150"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-full max-w-[342px] flex-col overflow-hidden rounded-2xl border border-ocean-600/70 bg-[#0c1a29] shadow-2xl shadow-black/80 my-auto max-h-[calc(100dvh-20px)] sm:max-h-[calc(100dvh-36px)]"
      >
        {/* Header Bar: Perfectly aligned with site's ocean gradient & typography */}
        <div className="shrink-0 flex items-center justify-between border-b border-ocean-700/60 bg-gradient-to-r from-[#173857] via-[#286398] to-[#193d60] px-3.5 py-2.5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold-200/20 border border-gold-300/40 text-gold-200 shadow-sm">
              <Coffee className="h-4 w-4 text-[#FFE79C]" aria-hidden="true" />
            </div>
            <div>
              <h2
                id="kofi-modal-title"
                className="text-xs sm:text-sm font-bold text-white tracking-tight"
              >
                Support on Ko-fi
              </h2>
              <p className="text-xs font-medium text-[#FFE79C]/90">
                @{username}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Direct External Link */}
            <a
              href={kofiDirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open full page on ko-fi.com in a new tab"
              aria-label="Open full page on ko-fi.com in a new tab"
              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-ocean-600/70 bg-[#0e2135]/80 text-sky-200 transition hover:bg-[#163554] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>

            {/* Close Modal */}
            <button
              type="button"
              onClick={onClose}
              title="Close"
              aria-label="Close modal"
              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-ocean-600/70 bg-[#0e2135]/80 text-slate-300 transition hover:bg-rose-950/70 hover:text-rose-200 hover:border-rose-600/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Embedded Ko-fi Widget Container: Maintained light mode only to preserve creator profile picture integrity */}
        <div
          className="relative flex-1 overflow-y-auto overscroll-contain bg-white"
          style={{
            maxHeight: "calc(100dvh - 88px)",
          }}
        >
          {isLoading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center">
              {!isTimedOut ? (
                <>
                  <Loader2 className="h-7 w-7 animate-spin text-ocean-600" />
                  <span className="text-xs font-medium text-slate-600">
                    Loading Ko-fi widget…
                  </span>
                </>
              ) : (
                <>
                  <Coffee className="h-8 w-8 text-terracotta-500" />
                  <p className="text-xs font-semibold text-slate-700">
                    Your browser&apos;s privacy shield may be blocking the embedded Ko-fi widget.
                  </p>
                  <a
                    href={kofiDirectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-terracotta-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-terracotta-500"
                  >
                    <span>Open ko-fi.com/{username}</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </>
              )}
            </div>
          )}

          <iframe
            id="kofiframe"
            src={kofiEmbedUrl}
            onLoad={() => {
              setIsLoading(false);
              setIsTimedOut(false);
            }}
            title="Support on Ko-fi"
            referrerPolicy="no-referrer"
            allow="payment 'src'"
            className="w-full border-none transition-all duration-300"
            style={{
              height: "640px",
              minHeight: "640px",
              marginTop: "-8px", // Clean flush alignment: trims top margin so the blue polygon banner sits flush with the header
              filter: "none",
            }}
          />
        </div>

        {/* Tablet / Mobile Fallback: Direct link if browser security or embedded payment hangs */}
        <div className="shrink-0 border-t border-ocean-700/60 bg-[#081522] px-3 py-1.5 text-center">
          <a
            href={kofiDirectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-200/80 hover:text-gold-200 transition"
          >
            <span>Payment slow or freezing?</span>
            <span className="text-[#FFE79C] underline underline-offset-2 flex items-center gap-0.5">
              Open directly on Ko-fi
              <ExternalLink className="h-2.5 w-2.5 inline" />
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
