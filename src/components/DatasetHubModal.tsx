"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Archive,
  BrainCircuit,
  Download,
  FileJson,
  FileSpreadsheet,
  FolderOpen,
  HardDrive,
  Loader2,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  CapturedSample,
  DatasetSnapshotSummary,
  PoseClassMeta,
  TrainedModelRecord,
} from "@/types/handpose";
import {
  deleteDatasetLocally,
  deleteModelLocally,
  listLocalDatasets,
  listLocalModels,
  loadDatasetLocallyById,
  saveDatasetLocally,
} from "@/lib/storage";
import {
  exportDatasetJson,
  exportDatasetZip,
  exportLandmarksCsv,
  exportTrainedModelZip,
  parseImportedDatasetJson,
} from "@/lib/export";
import ConfirmDialog from "@/components/ConfirmDialog";

interface DatasetHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: PoseClassMeta[];
  samples: CapturedSample[];
  activeModel: TrainedModelRecord | null;
  onRestoreWorkspace: (
    classes: PoseClassMeta[],
    samples: CapturedSample[]
  ) => void;
  onRestoreModel: (model: TrainedModelRecord) => void;
}

export default function DatasetHubModal({
  isOpen,
  onClose,
  classes,
  samples,
  activeModel,
  onRestoreWorkspace,
  onRestoreModel,
}: DatasetHubModalProps) {
  const [activeTab, setActiveTab] = useState<"export" | "local">("export");
  const [datasetName, setDatasetName] = useState("handpose-dataset");
  const [snapshotDesc, setSnapshotDesc] = useState("");

  const [savedDatasets, setSavedDatasets] = useState<DatasetSnapshotSummary[]>(
    []
  );
  const [savedModels, setSavedModels] = useState<TrainedModelRecord[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    variant: "danger" | "warning" | "primary";
    onConfirm: () => void;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const exportTabRef = useRef<HTMLButtonElement | null>(null);
  const localTabRef = useRef<HTMLButtonElement | null>(null);
  const datasetsHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const modelsHeadingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const refreshLocalData = async () => {
    try {
      setLoadingLocal(true);
      const [dsList, mdlList] = await Promise.all([
        listLocalDatasets(),
        listLocalModels(),
      ]);
      setSavedDatasets(dsList);
      setSavedModels(mdlList);
    } catch (err) {
      console.warn("Could not load local browser records:", err);
    } finally {
      setLoadingLocal(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    triggerElementRef.current = document.activeElement as HTMLElement | null;
    refreshLocalData();

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
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const showTempMessage = (text: string, type: "success" | "error" = "success") => {
    setStatusMsg({ type, text });
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      if (activeTab === "export") {
        setActiveTab("local");
        localTabRef.current?.focus();
      } else {
        setActiveTab("export");
        exportTabRef.current?.focus();
      }
    }
  };

  const handleExportZip = async () => {
    try {
      setExportingZip(true);
      await exportDatasetZip(classes, samples, datasetName);
      showTempMessage(
        `Exported ${samples.length} samples across ${classes.length} classes (.zip).`
      );
    } catch (err) {
      showTempMessage(
        err instanceof Error ? err.message : "Failed to generate ZIP archive.",
        "error"
      );
    } finally {
      setExportingZip(false);
    }
  };

  const handleExportCsv = () => {
    try {
      exportLandmarksCsv(samples, datasetName);
      showTempMessage(`Exported landmarks table (${samples.length} rows) as .csv.`);
    } catch (err) {
      showTempMessage(
        err instanceof Error ? err.message : "Failed to export CSV.",
        "error"
      );
    }
  };

  const handleExportJson = () => {
    try {
      exportDatasetJson(classes, samples, datasetName);
      showTempMessage(`Saved workspace backup (.json) to your downloads.`);
    } catch (err) {
      showTempMessage(
        err instanceof Error ? err.message : "Failed to export JSON backup.",
        "error"
      );
    }
  };

  const handleExportModel = async () => {
    if (!activeModel) return;
    try {
      await exportTrainedModelZip(activeModel);
      showTempMessage(`Downloaded "${activeModel.name}" TF.js model bundle (.zip).`);
    } catch (err) {
      showTempMessage(
        err instanceof Error ? err.message : "Failed to export model bundle.",
        "error"
      );
    }
  };

  const handleSaveSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!datasetName.trim() || samples.length === 0) return;

    try {
      setSavingSnapshot(true);
      await saveDatasetLocally({
        name: datasetName.trim(),
        description: snapshotDesc.trim(),
        classes,
        samples,
      });
      setSnapshotDesc("");
      await refreshLocalData();
      showTempMessage("Dataset snapshot saved to your browser's local storage!");
    } catch (err) {
      showTempMessage(
        err instanceof Error ? err.message : "Failed to save local snapshot",
        "error"
      );
    } finally {
      setSavingSnapshot(false);
    }
  };

  const executeLoadDataset = async (id: string) => {
    try {
      setLoadingLocal(true);
      const snap = await loadDatasetLocallyById(id);
      onRestoreWorkspace(snap.classes, snap.samples);
      showTempMessage(
        `Loaded dataset "${snap.name}" (${snap.samples.length} samples)`
      );
      onClose();
    } catch {
      showTempMessage("Failed to load dataset from local storage.", "error");
    } finally {
      setLoadingLocal(false);
    }
  };

  const handleLoadDataset = (id: string) => {
    if (samples.length > 0) {
      const snap = savedDatasets.find((d) => d.id === id);
      setConfirmState({
        title: `Load "${snap?.name || "Snapshot"}"?`,
        description: `Loading this snapshot will replace your current active workspace (${samples.length} captured samples). You can save a snapshot of your current workspace first if you want to keep it.`,
        confirmLabel: "Replace & Load Snapshot",
        variant: "warning",
        onConfirm: () => {
          setConfirmState(null);
          executeLoadDataset(id);
        },
      });
      return;
    }
    executeLoadDataset(id);
  };

  const handleDeleteDataset = (id: string) => {
    const snap = savedDatasets.find((d) => d.id === id);
    const name = snap?.name || "this dataset snapshot";
    setConfirmState({
      title: `Delete Snapshot "${name}"?`,
      description: `This will permanently remove the saved snapshot "${name}" from your browser's local storage. This cannot be undone.`,
      confirmLabel: "Delete Snapshot",
      variant: "danger",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await deleteDatasetLocally(id);
          setSavedDatasets((prev) => prev.filter((d) => d.id !== id));
          showTempMessage(`Deleted snapshot "${name}".`);
          datasetsHeadingRef.current?.focus();
        } catch {
          showTempMessage("Failed to delete local dataset.", "error");
        }
      },
    });
  };

  const handleDeleteModel = (id: string) => {
    const mdl = savedModels.find((m) => m.id === id);
    const name = mdl?.name || "this model";
    setConfirmState({
      title: `Delete Model "${name}"?`,
      description: `This will permanently remove the trained model "${name}" from your browser's model library. This cannot be undone.`,
      confirmLabel: "Delete Model",
      variant: "danger",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          await deleteModelLocally(id);
          setSavedModels((prev) => prev.filter((m) => m.id !== id));
          showTempMessage(`Deleted model "${name}".`);
          modelsHeadingRef.current?.focus();
        } catch {
          showTempMessage("Failed to delete local model.", "error");
        }
      },
    });
  };

  const processImportedFile = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      showTempMessage(
        "This file is larger than 50 MB. Please select a valid Hand Pose Studio workspace (.json) backup.",
        "error"
      );
      return;
    }

    try {
      const text = await file.text();
      const imported = parseImportedDatasetJson(text);
      onRestoreWorkspace(imported.classes, imported.samples);
      showTempMessage(
        `Imported ${imported.samples.length} samples across ${imported.classes.length} classes!`
      );
      onClose();
    } catch (err) {
      showTempMessage(
        err instanceof Error ? err.message : "Invalid dataset JSON file",
        "error"
      );
    }
  };

  const handleImportJsonFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (samples.length > 0) {
      setConfirmState({
        title: "Import Workspace Backup?",
        description: `Importing "${file.name}" will replace your current workspace (${samples.length} captured samples). Do you want to continue?`,
        confirmLabel: "Replace & Import",
        variant: "warning",
        onConfirm: () => {
          setConfirmState(null);
          processImportedFile(file);
        },
      });
      return;
    }

    await processImportedFile(file);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dataset-hub-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4 backdrop-blur-sm overscroll-contain"
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-ocean-700/60 bg-[#0e1d2f] shadow-2xl overscroll-contain"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-ocean-700/50 bg-[#12253b] px-4 sm:px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <HardDrive className="h-5 w-5 text-terracotta-400" aria-hidden="true" />
            <div>
              <h2
                id="dataset-hub-modal-title"
                className="text-sm sm:text-base font-bold text-white"
              >
                Export Files &amp; Browser Snapshots
              </h2>
              <p className="text-xs text-sky-200/80">
                Download datasets/models or manage snapshots stored privately in
                your browser
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            title="Close dialog"
            aria-label="Close dialog"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg p-1.5 text-slate-300 hover:bg-[#183554] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Tabs */}
        <div
          role="tablist"
          aria-label="Dataset Hub Sections"
          className="flex border-b border-ocean-700/50 bg-[#091522] px-4 sm:px-6 pt-2"
        >
          <button
            ref={exportTabRef}
            id="hub-tab-export"
            type="button"
            role="tab"
            aria-selected={activeTab === "export"}
            aria-controls="hub-panel-export"
            tabIndex={activeTab === "export" ? 0 : -1}
            onKeyDown={handleTabKeyDown}
            onClick={() => setActiveTab("export")}
            className={`min-h-[40px] border-b-2 px-3 sm:px-4 py-2 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              activeTab === "export"
                ? "border-terracotta-500 text-terracotta-400"
                : "border-transparent text-slate-300 hover:text-white"
            }`}
          >
            Export &amp; Import Files
          </button>
          <button
            ref={localTabRef}
            id="hub-tab-local"
            type="button"
            role="tab"
            aria-selected={activeTab === "local"}
            aria-controls="hub-panel-local"
            tabIndex={activeTab === "local" ? 0 : -1}
            onKeyDown={handleTabKeyDown}
            onClick={() => setActiveTab("local")}
            className={`min-h-[40px] border-b-2 px-3 sm:px-4 py-2 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              activeTab === "local"
                ? "border-terracotta-500 text-terracotta-400"
                : "border-transparent text-slate-300 hover:text-white"
            }`}
          >
            Browser Snapshots &amp; Library ({savedDatasets.length + savedModels.length})
          </button>
        </div>

        {statusMsg && (
          <div
            role={statusMsg.type === "error" ? "alert" : "status"}
            aria-live="polite"
            className={`border-b px-5 py-2.5 text-xs font-medium ${
              statusMsg.type === "error"
                ? "bg-rose-950/60 border-rose-500/40 text-rose-200"
                : "bg-ocean-600/30 border-ocean-500/40 text-sky-100"
            }`}
          >
            {statusMsg.text}
          </div>
        )}

        {/* Modal Content */}
        <div
          role="tabpanel"
          id={activeTab === "export" ? "hub-panel-export" : "hub-panel-local"}
          aria-labelledby={
            activeTab === "export" ? "hub-tab-export" : "hub-tab-local"
          }
          className="flex-1 overflow-y-auto p-4 sm:p-6"
        >
          {activeTab === "export" ? (
            <div className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="export-filename-prefix"
                  className="block text-xs font-semibold text-slate-200 mb-1.5"
                >
                  Export Filename Prefix
                </label>
                <input
                  id="export-filename-prefix"
                  type="text"
                  maxLength={80}
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  aria-label="Export Filename Prefix"
                  className="w-full rounded-xl border border-ocean-700/60 bg-[#081320] px-3 py-2 text-base sm:text-xs text-white focus:border-ocean-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* 1. Full ZIP Archive */}
                <button
                  type="button"
                  onClick={handleExportZip}
                  disabled={samples.length === 0 || exportingZip}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-ocean-700/60 bg-[#091522] p-4 text-left transition hover:border-terracotta-500/60 hover:bg-[#0c1c2e] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  <div className="flex items-center gap-2 text-terracotta-400 font-bold text-xs">
                    {exportingZip ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Archive className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>
                      {exportingZip
                        ? "Packaging ZIP Archive…"
                        : "Download Full Dataset (.zip)"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Includes class folders with JPEG images, JSON 21-point
                    annotations, and landmarks.csv.
                  </p>
                </button>

                {/* 2. Landmarks CSV */}
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={samples.length === 0}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-ocean-700/60 bg-[#091522] p-4 text-left transition hover:border-emerald-500/60 hover:bg-[#0c1c2e] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                    <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                    <span>Export Landmarks Table (.csv)</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Flat tabular CSV with raw &amp; normalized 1-hand &amp; 2-hand
                    coordinates for Python / scikit-learn / PyTorch.
                  </p>
                </button>

                {/* 3. Workspace JSON Backup */}
                <button
                  type="button"
                  onClick={handleExportJson}
                  disabled={samples.length === 0}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-ocean-700/60 bg-[#091522] p-4 text-left transition hover:border-ocean-400/60 hover:bg-[#0c1c2e] disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  <div className="flex items-center gap-2 text-sky-300 font-bold text-xs">
                    <FileJson className="h-4 w-4" aria-hidden="true" />
                    <span>Backup Workspace (.json)</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Lossless JSON snapshot of all classes, images, and 3D
                    landmarks for later restoration.
                  </p>
                </button>

                {/* 4. Import Workspace JSON */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-start gap-1.5 rounded-xl border border-dashed border-ocean-600/60 bg-[#081320]/70 p-4 text-left transition hover:border-gold-300/60 hover:bg-[#0c1c2e] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                >
                  <div className="flex items-center gap-2 text-gold-300 font-bold text-xs">
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    <span>Import Workspace (.json)</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Restore a previously exported Hand Pose Studio JSON dataset
                    into the studio.
                  </p>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportJsonFile}
                  className="hidden"
                />
              </div>

              {/* Active Trained Model Export */}
              {activeModel?.serializedModel && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-emerald-300">
                        Trained TensorFlow.js Model Ready (
                        {activeModel.finalAccuracy}% Acc)
                      </h4>
                      <p className="text-xs text-slate-300">
                        Bundles model.json, model.weights.bin, classes.json &amp;
                        inference-example.js
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportModel}
                      className="min-h-[40px] shrink-0 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                    >
                      Download TF.js Bundle (.zip)
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {/* Save Snapshot to Browser Local Storage */}
              <form
                onSubmit={handleSaveSnapshot}
                className="rounded-xl border border-ocean-700/60 bg-[#091522] p-4"
              >
                <h3 className="text-xs font-bold text-white mb-2.5 flex items-center gap-1.5">
                  <Save className="h-4 w-4 text-terracotta-400" aria-hidden="true" />
                  <span>
                    Save Named Snapshot in Browser ({samples.length} samples)
                  </span>
                </h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <input
                    type="text"
                    maxLength={80}
                    value={datasetName}
                    onChange={(e) => setDatasetName(e.target.value)}
                    placeholder="Dataset snapshot name…"
                    aria-label="Dataset snapshot name"
                    className="rounded-lg border border-ocean-700/60 bg-[#07111b] px-3 py-2 text-base sm:text-xs text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400"
                  />
                  <input
                    type="text"
                    maxLength={200}
                    value={snapshotDesc}
                    onChange={(e) => setSnapshotDesc(e.target.value)}
                    placeholder="Optional notes / description…"
                    aria-label="Optional snapshot notes or description"
                    className="rounded-lg border border-ocean-700/60 bg-[#07111b] px-3 py-2 text-base sm:text-xs text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-ocean-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={savingSnapshot || samples.length === 0}
                  className="mt-2.5 flex min-h-[40px] items-center gap-1.5 rounded-lg bg-gradient-to-r from-terracotta-600 to-terracotta-700 px-3.5 py-2 text-xs font-bold text-white hover:from-terracotta-500 hover:to-terracotta-600 disabled:opacity-40 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
                >
                  {savingSnapshot ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>Save Snapshot Locally</span>
                </button>
              </form>

              {/* Saved Local Datasets */}
              <div>
                <h4
                  ref={datasetsHeadingRef}
                  tabIndex={-1}
                  className="text-xs font-bold text-slate-200 mb-2 flex items-center gap-1.5 focus:outline-none"
                >
                  <FolderOpen className="h-4 w-4 text-sky-400" aria-hidden="true" />
                  <span>
                    Saved Browser Dataset Snapshots ({savedDatasets.length})
                  </span>
                </h4>

                {loadingLocal ? (
                  <div className="flex items-center gap-2 py-4 text-xs text-slate-300">
                    <Loader2 className="h-4 w-4 animate-spin text-sky-400" />
                    <span>Reading browser storage…</span>
                  </div>
                ) : savedDatasets.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-ocean-800 p-4 text-center text-xs text-slate-300">
                    No named dataset snapshots saved in your browser yet. (Your
                    active workspace is still auto-saved automatically!)
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {savedDatasets.map((ds) => (
                      <div
                        key={ds.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-ocean-700/60 bg-[#091522] p-3"
                      >
                        <div>
                          <div className="text-xs font-bold text-white">
                            {ds.name}
                          </div>
                          <div
                            className="text-xs text-sky-200/80"
                            suppressHydrationWarning
                          >
                            {ds.sampleCount} samples &bull; {ds.classes.length}{" "}
                            classes &bull;{" "}
                            {new Date(ds.updatedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                          {ds.description && (
                            <div className="text-xs text-slate-300">
                              {ds.description}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleLoadDataset(ds.id)}
                            className="flex min-h-[38px] items-center gap-1 rounded-lg border border-ocean-600/60 bg-[#163554] px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-[#1f456c] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Load</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDataset(ds.id)}
                            title={`Delete snapshot ${ds.name}`}
                            aria-label={`Delete snapshot ${ds.name}`}
                            className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg p-1.5 text-slate-300 hover:bg-terracotta-500/20 hover:text-terracotta-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-400"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Saved Local Models */}
              <div>
                <h4
                  ref={modelsHeadingRef}
                  tabIndex={-1}
                  className="text-xs font-bold text-slate-200 mb-2 flex items-center gap-1.5 focus:outline-none"
                >
                  <BrainCircuit className="h-4 w-4 text-ocean-400" aria-hidden="true" />
                  <span>Saved Browser Models ({savedModels.length})</span>
                </h4>

                {savedModels.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-ocean-800 p-4 text-center text-xs text-slate-300">
                    No trained models saved to your browser library yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {savedModels.map((mdl) => (
                      <div
                        key={mdl.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-ocean-700/60 bg-[#091522] p-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white">
                              {mdl.name}
                            </span>
                            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono text-xs text-emerald-300">
                              {mdl.finalAccuracy}% Acc
                            </span>
                          </div>
                          <div
                            className="text-xs text-sky-200/80"
                            suppressHydrationWarning
                          >
                            Classes: {mdl.classes.join(", ")} &bull;{" "}
                            {new Date(mdl.trainedAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              onRestoreModel(mdl);
                              onClose();
                            }}
                            className="flex min-h-[38px] items-center gap-1 rounded-lg border border-ocean-600/60 bg-[#163554] px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-[#1f456c] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Activate</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteModel(mdl.id)}
                            title={`Delete model ${mdl.name}`}
                            aria-label={`Delete model ${mdl.name}`}
                            className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg p-1.5 text-slate-300 hover:bg-terracotta-500/20 hover:text-terracotta-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-400"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(confirmState)}
        title={confirmState?.title || ""}
        description={confirmState?.description || ""}
        confirmLabel={confirmState?.confirmLabel || "Confirm"}
        variant={confirmState?.variant || "danger"}
        onConfirm={() => confirmState?.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
