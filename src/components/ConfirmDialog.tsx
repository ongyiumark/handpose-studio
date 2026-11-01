"use client";

import React, { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    if (!isOpen) return;

    triggerElementRef.current = document.activeElement as HTMLElement | null;
    // Focus safe Cancel button by default to prevent accidental destructive Enter key presses
    cancelBtnRef.current?.focus();

    const modal = modalRef.current;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancelRef.current();
        return;
      }
      if (e.key === "Tab" && modal) {
        const focusables = modal.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (
        triggerElementRef.current &&
        document.body.contains(triggerElementRef.current)
      ) {
        triggerElementRef.current.focus();
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const confirmBtnClasses =
    variant === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-500 focus-visible:ring-rose-400"
      : variant === "warning"
      ? "bg-terracotta-600 text-white hover:bg-terracotta-500 focus-visible:ring-terracotta-400"
      : "bg-ocean-600 text-white hover:bg-ocean-500 focus-visible:ring-ocean-400";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      onClick={onCancel}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overscroll-contain"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-ocean-700/70 bg-[#0e1d2f] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ocean-700/50 bg-[#12253b] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
                variant === "danger"
                  ? "border-rose-500/40 bg-rose-500/15 text-rose-300"
                  : "border-gold-300/40 bg-gold-200/15 text-gold-200"
              }`}
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            </div>
            <h2
              id="confirm-dialog-title"
              className="text-sm sm:text-base font-bold text-white"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel and close dialog"
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg p-1.5 text-slate-300 hover:bg-[#183554] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p
            id="confirm-dialog-desc"
            className="text-xs sm:text-sm leading-relaxed text-slate-200"
          >
            {description}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2.5 border-t border-ocean-700/50 bg-[#091522] px-5 py-3">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="min-h-[40px] rounded-xl border border-ocean-600/70 bg-[#13273e] px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-[#1a3857] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-[40px] rounded-xl px-4 py-2 text-xs font-bold transition shadow-md focus:outline-none focus-visible:ring-2 ${confirmBtnClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
