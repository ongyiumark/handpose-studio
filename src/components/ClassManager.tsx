"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Check,
  Edit3,
  Eye,
  FolderPlus,
  Layers,
  Plus,
  Trash2,
  X,
  ZoomIn,
} from "lucide-react";
import { CapturedSample, PoseClassMeta } from "@/types/handpose";
import { drawHandsOnCanvas } from "@/lib/landmarks";

interface SampleCardProps {
  sample: CapturedSample;
  accentColor: string;
  showOverlay: boolean;
  onPreview: (sample: CapturedSample) => void;
  onDelete: (id: string) => void;
}

const SampleCard = React.memo(function SampleCard({
  sample,
  accentColor,
  showOverlay,
  onPreview,
  onDelete,
}: SampleCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (showOverlay && sample.hands && sample.hands.length > 0) {
      drawHandsOnCanvas(sample.hands, ctx, canvas.width, canvas.height, {
        compact: true,
        showLabels: false,
        accentColor,
      });
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [sample.hands, accentColor, showOverlay]);

  const primaryHand = sample.hands?.[0];
  const handCount = sample.hands?.length || 0;

  return (
    <div className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-ocean-800/60 bg-[#08121d] shadow-sm transition hover:border-ocean-400 hover:scale-[1.02]">
      <button
        type="button"
        onClick={() => onPreview(sample)}
        className="absolute inset-0 h-full w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400 rounded-xl"
        title="Click to inspect sample & 3D landmarks"
        aria-label={`Inspect sample for ${sample.className}`}
      >
        {sample.imageDataUrl ? (
          <Image
            src={sample.imageDataUrl}
            alt={sample.className}
            fill
            unoptimized
            sizes="160px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#0d1a29] text-xs text-slate-300">
            3D Landmarks
          </div>
        )}

        {showOverlay && sample.hands && sample.hands.length > 0 && (
          <canvas
            ref={canvasRef}
            width={sample.width || 320}
            height={sample.height || 240}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        )}

        {/* Hover Zoom Hint */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25 opacity-0 transition group-hover:opacity-100">
          <div className="rounded-full bg-[#0d2238]/90 p-2 text-sky-200 shadow-lg border border-ocean-500/50">
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>

        {/* Handedness & Confidence Badge */}
        {primaryHand && (
          <div className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-[#071320]/90 px-1.5 py-0.5 text-xs font-medium text-slate-100 backdrop-blur-sm">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: accentColor }}
            />
            <span>
              {handCount > 1
                ? `2H • ${sample.hands.map((h) => h.handedness[0]).join("+")}`
                : `${primaryHand.handedness[0]} • ${(primaryHand.score * 100).toFixed(0)}%`}
            </span>
          </div>
        )}
      </button>

      {/* Delete Sample Button — always visible on touch/coarse pointers, hover/focus-revealed on fine pointers */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(sample.id);
        }}
        title="Delete sample"
        aria-label={`Delete ${sample.className} sample`}
        className="absolute top-1.5 right-1.5 z-10 flex min-h-[28px] min-w-[28px] items-center justify-center rounded-md bg-terracotta-700/95 text-white opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white shadow transition hover:bg-terracotta-600 active:scale-95 touch-manipulation"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
});

interface SamplePreviewModalProps {
  sample: CapturedSample;
  accentColor: string;
  onClose: () => void;
  onDelete: (id: string) => void;
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
}

function SamplePreviewModal({
  sample,
  accentColor,
  onClose,
  onDelete,
  fallbackFocusRef,
}: SamplePreviewModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    triggerElementRef.current = document.activeElement as HTMLElement | null;

    const modal = modalRef.current;
    if (modal) {
      const focusables = modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (
        triggerElementRef.current &&
        document.body.contains(triggerElementRef.current)
      ) {
        triggerElementRef.current.focus();
      } else if (fallbackFocusRef?.current) {
        fallbackFocusRef.current.focus();
      }
    };
  }, [fallbackFocusRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (sample.hands && sample.hands.length > 0) {
      drawHandsOnCanvas(sample.hands, ctx, canvas.width, canvas.height, {
        compact: false,
        showLabels: true,
        accentColor,
      });
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [sample.hands, accentColor]);

  const dateStr = new Date(sample.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const aspectRatio =
    sample.width && sample.height
      ? `${sample.width} / ${sample.height}`
      : "4 / 3";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sample-preview-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 sm:p-6 backdrop-blur-sm overscroll-contain"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-ocean-600/70 bg-[#0d1c2d] shadow-2xl overscroll-contain animate-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-ocean-700/60 bg-[#12263a] px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span
              className="h-3.5 w-3.5 rounded-full shadow-sm"
              style={{ backgroundColor: accentColor }}
            />
            <div>
              <div className="flex items-center gap-2">
                <h3
                  id="sample-preview-title"
                  className="text-sm font-bold text-white"
                >
                  {sample.className}
                </h3>
                <span className="rounded bg-ocean-700/60 px-2 py-0.5 text-xs font-mono text-sky-200">
                  {sample.hands.length === 1
                    ? "1 Hand"
                    : `${sample.hands.length} Hands`}
                </span>
              </div>
              <p className="text-xs text-sky-200/80">Captured at {dateStr}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Close sample preview"
            aria-label="Close sample preview"
            className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg p-1.5 text-slate-300 hover:bg-[#1a344e] hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Enlarged Image & Canvas Viewport */}
        <div
          style={{ aspectRatio }}
          className="relative w-full max-h-[62vh] bg-[#07111b] flex items-center justify-center overflow-hidden"
        >
          {sample.imageDataUrl ? (
            <Image
              src={sample.imageDataUrl}
              alt={sample.className}
              fill
              unoptimized
              className="object-contain"
            />
          ) : (
            <div className="text-xs text-slate-300">
              No Image Preview Available
            </div>
          )}

          <canvas
            ref={canvasRef}
            width={sample.width || 640}
            height={sample.height || 480}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ocean-700/60 bg-[#102235] px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-slate-200">
            {sample.hands.map((h, i) => (
              <span
                key={i}
                className="rounded-lg border border-ocean-700/60 bg-[#0a1624] px-2.5 py-1 text-xs font-medium"
              >
                {h.handedness}:{" "}
                <strong className="text-emerald-400">
                  {(h.score * 100).toFixed(0)}%
                </strong>
              </span>
            ))}
            <span className="text-ocean-400 hidden sm:inline">&bull;</span>
            <span className="text-xs text-slate-300 hidden sm:inline">
              Resolution: {sample.width}&times;{sample.height}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onDelete(sample.id);
                onClose();
              }}
              className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/25 transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Delete Sample</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] rounded-lg bg-ocean-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-ocean-600 transition active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ClassManagerProps {
  classes: PoseClassMeta[];
  samples: CapturedSample[];
  activeClassName: string | null;
  onSelectClass: (name: string) => void;
  onAddClass: (name: string) => void;
  onRenameClass: (oldName: string, newName: string) => void;
  onDeleteClass: (name: string) => void;
  onDeleteSample: (id: string) => void;
  onClearAll: () => void;
  isTraining?: boolean;
  onPreviewModalChange?: (isOpen: boolean) => void;
}

const PRESET_CLASSES = [
  "Thumbs Up",
  "Peace",
  "Open Palm",
  "Fist",
  "OK Sign",
  "Pointing",
];

function ClassManager({
  classes,
  samples,
  activeClassName,
  onSelectClass,
  onAddClass,
  onRenameClass,
  onDeleteClass,
  onDeleteSample,
  onClearAll,
  isTraining = false,
  onPreviewModalChange,
}: ClassManagerProps) {
  const [newClassInput, setNewClassInput] = useState("");
  const [editingClass, setEditingClass] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showOverlayOnThumbs, setShowOverlayOnThumbs] = useState(true);
  const [galleryFilter, setGalleryFilter] = useState<"active" | "all">("active");
  const [previewSample, setPreviewSample] = useState<CapturedSample | null>(
    null
  );
  const committingRenameRef = useRef(false);
  const galleryHeadingRef = useRef<HTMLHeadingElement | null>(null);

  const handleOpenPreview = (sample: CapturedSample) => {
    setPreviewSample(sample);
    onPreviewModalChange?.(true);
  };

  const handleClosePreview = () => {
    setPreviewSample(null);
    onPreviewModalChange?.(false);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newClassInput.trim();
    if (!trimmed) return;
    onAddClass(trimmed);
    setNewClassInput("");
  };

  const startRename = (name: string) => {
    committingRenameRef.current = false;
    setEditingClass(name);
    setEditValue(name);
  };

  const commitRename = (oldName: string) => {
    if (committingRenameRef.current) return;
    committingRenameRef.current = true;
    const trimmed = editValue.trim();
    setEditingClass(null);
    if (trimmed && trimmed !== oldName) {
      onRenameClass(oldName, trimmed);
    }
  };

  const cancelRename = () => {
    committingRenameRef.current = true;
    setEditingClass(null);
  };

  const countsByClass = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of samples) {
      counts.set(s.className, (counts.get(s.className) || 0) + 1);
    }
    return counts;
  }, [samples]);

  const displayedSamples = useMemo(() => {
    const list =
      galleryFilter === "all" || !activeClassName
        ? samples
        : samples.filter((s) => s.className === activeClassName);
    return list.slice().reverse();
  }, [samples, galleryFilter, activeClassName]);

  const colorMap = useMemo(
    () => new Map(classes.map((c) => [c.name, c.color])),
    [classes]
  );
  const existingNames = useMemo(
    () => new Set(classes.map((c) => c.name.toLowerCase())),
    [classes]
  );
  const availablePresets = useMemo(
    () => PRESET_CLASSES.filter((p) => !existingNames.has(p.toLowerCase())),
    [existingNames]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Pose Classes Card */}
      <div className="rounded-2xl border border-ocean-700/50 bg-[#101e2e]/90 p-4 shadow-xl">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <FolderPlus className="h-4 w-4 text-terracotta-400" aria-hidden="true" />
            <h2 className="text-sm font-bold text-white">
              1. Hand Pose Classes ({classes.length})
            </h2>
          </div>
          <span className="text-xs text-sky-200/80">
            Select a class to record into
          </span>
        </div>

        {/* Add Class Input */}
        <form onSubmit={handleCreate} className="flex gap-2">
          <input
            type="text"
            maxLength={48}
            value={newClassInput}
            onChange={(e) => setNewClassInput(e.target.value)}
            disabled={isTraining}
            placeholder="Add a pose class (e.g. Rock, Paper, Scissors)…"
            aria-label="New hand pose class name"
            className="flex-1 rounded-xl border border-ocean-700/60 bg-[#081320] px-3 py-2 text-base sm:text-xs text-white placeholder-slate-400 focus:border-ocean-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400 disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={!newClassInput.trim() || isTraining}
            className="flex min-h-[42px] sm:min-h-[38px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-terracotta-600 to-terracotta-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-terracotta-950/40 transition hover:from-terracotta-500 hover:to-terracotta-600 disabled:cursor-not-allowed disabled:opacity-40 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add Class</span>
          </button>
        </form>

        {/* Quick-Add Preset Chips */}
        {availablePresets.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-300">Quick presets:</span>
            {availablePresets.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={isTraining}
                onClick={() => onAddClass(preset)}
                className="min-h-[32px] sm:min-h-[28px] rounded-full border border-ocean-700/60 bg-[#091522] px-2.5 py-1 text-xs font-medium text-sky-200 transition hover:border-ocean-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                + {preset}
              </button>
            ))}
          </div>
        )}

        {/* Class List */}
        {classes.length === 0 ? (
          <div className="mt-3.5 rounded-xl border border-dashed border-ocean-800/80 bg-[#081320]/60 p-4 text-center text-xs text-slate-300">
            No pose classes yet. Type a name above or click a quick preset chip to create your first class!
          </div>
        ) : (
          <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {classes.map((cls) => {
              const count = countsByClass.get(cls.name) || 0;
              const isSelected = cls.name === activeClassName;
              const isEditing = editingClass === cls.name;

              return (
                <div
                  key={cls.name}
                  className={`group flex items-center justify-between gap-2 rounded-xl border p-2.5 transition ${
                    isSelected
                      ? "border-terracotta-500/70 bg-[#162e47] shadow-sm shadow-terracotta-950/20"
                      : "border-ocean-800/60 bg-[#0a1624]/80 hover:border-ocean-700"
                  }`}
                >
                  {isEditing ? (
                    <div className="flex flex-1 items-center gap-1.5">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full shadow-sm"
                        style={{ backgroundColor: cls.color }}
                      />
                      <input
                        type="text"
                        maxLength={48}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => commitRename(cls.name)}
                        onKeyDown={(e) => {
                          // IME-safe Enter handling for CJK composition (checks both isComposing and Safari keyCode 229)
                          if (
                            e.nativeEvent.isComposing ||
                            e.keyCode === 229
                          ) {
                            return;
                          }
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitRename(cls.name);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        autoFocus
                        aria-label={`Rename class ${cls.name}`}
                        className="w-full rounded border border-ocean-500 bg-[#091522] px-2 py-1 text-base sm:text-xs text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => commitRename(cls.name)}
                        className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded p-1 text-emerald-400 hover:bg-[#16304d]"
                        aria-label="Confirm rename"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectClass(cls.name)}
                      aria-pressed={isSelected}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400 rounded-lg p-1 cursor-pointer"
                    >
                      <span
                        className="h-3 w-3 shrink-0 rounded-full shadow-sm"
                        style={{ backgroundColor: cls.color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-bold text-white">
                            {cls.name}
                          </span>
                          {isSelected && (
                            <span className="rounded bg-terracotta-500/20 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wider text-terracotta-300">
                              Active
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-sky-200/80">
                          {count} {count === 1 ? "sample" : "samples"}
                        </div>
                      </div>
                    </button>
                  )}

                  {/* Class Actions */}
                  {!isEditing && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={isTraining}
                        onClick={() => startRename(cls.name)}
                        title={`Rename ${cls.name}`}
                        aria-label={`Rename ${cls.name}`}
                        className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg p-1.5 text-slate-300 hover:bg-[#16304d] hover:text-white disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                      >
                        <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={isTraining}
                        onClick={() => onDeleteClass(cls.name)}
                        title={`Delete class ${cls.name}`}
                        aria-label={`Delete class ${cls.name}`}
                        className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg p-1.5 text-slate-300 hover:bg-terracotta-500/20 hover:text-terracotta-300 disabled:opacity-30 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Captured Samples Gallery Card */}
      <div className="rounded-2xl border border-ocean-700/50 bg-[#101e2e]/90 p-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-sky-300" aria-hidden="true" />
            <h3
              ref={galleryHeadingRef}
              tabIndex={-1}
              className="text-sm font-bold text-white focus:outline-none"
            >
              Captured Samples ({displayedSamples.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-ocean-700/60 bg-[#08121d] p-0.5 text-xs">
              <button
                type="button"
                aria-pressed={galleryFilter === "active"}
                onClick={() => setGalleryFilter("active")}
                className={`min-h-[30px] rounded-md px-2.5 py-0.5 font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  galleryFilter === "active"
                    ? "bg-ocean-700 text-white font-semibold"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Active Class
              </button>
              <button
                type="button"
                aria-pressed={galleryFilter === "all"}
                onClick={() => setGalleryFilter("all")}
                className={`min-h-[30px] rounded-md px-2.5 py-0.5 font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  galleryFilter === "all"
                    ? "bg-ocean-700 text-white font-semibold"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                All ({samples.length})
              </button>
            </div>

            <button
              type="button"
              aria-pressed={showOverlayOnThumbs}
              onClick={() => setShowOverlayOnThumbs((v) => !v)}
              title="Toggle 21-keypoint skeleton on sample thumbnails"
              className={`flex min-h-[32px] items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                showOverlayOnThumbs
                  ? "border-ocean-500/50 bg-ocean-600/20 text-sky-200"
                  : "border-ocean-800/60 bg-[#08121d] text-slate-300"
              }`}
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Landmarks</span>
            </button>

            {samples.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                disabled={isTraining}
                className="min-h-[32px] rounded-lg border border-rose-500/30 bg-rose-950/30 px-2.5 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-950/60 hover:text-rose-200 disabled:opacity-40 disabled:cursor-not-allowed transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
              >
                Clear All Samples
              </button>
            )}
          </div>
        </div>

        {displayedSamples.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ocean-800/80 bg-[#081320]/60 py-8 px-4 text-center">
            <p className="text-xs font-medium text-slate-200">
              No samples captured for{" "}
              {galleryFilter === "active" && activeClassName
                ? `"${activeClassName}"`
                : "this workspace"}{" "}
              yet.
            </p>
            <p className="mt-1 text-xs text-sky-200/80">
              Enable your camera and press{" "}
              <kbd className="rounded border border-ocean-600/50 bg-[#091522] px-1.5 py-0.5 font-mono text-xs text-slate-100">
                Space
              </kbd>{" "}
              or click <strong>Auto-Burst (15)</strong> to record 15 samples in 3 seconds.
            </p>
          </div>
        ) : (
          <div className="grid max-h-[300px] grid-cols-2 min-[420px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 overflow-y-auto pr-1">
            {displayedSamples.map((sample) => (
              <SampleCard
                key={sample.id}
                sample={sample}
                accentColor={colorMap.get(sample.className) || "#38bdf8"}
                showOverlay={showOverlayOnThumbs}
                onPreview={handleOpenPreview}
                onDelete={onDeleteSample}
              />
            ))}
          </div>
        )}
      </div>

      {/* Enlarged Sample Preview Modal */}
      {previewSample && (
        <SamplePreviewModal
          sample={previewSample}
          accentColor={colorMap.get(previewSample.className) || "#38bdf8"}
          onClose={handleClosePreview}
          onDelete={(id) => {
            onDeleteSample(id);
            handleClosePreview();
          }}
          fallbackFocusRef={galleryHeadingRef}
        />
      )}
    </div>
  );
}

export default React.memo(ClassManager);
