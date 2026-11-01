"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type * as tf from "@tensorflow/tfjs";
import * as Sentry from "@sentry/nextjs";
import Navbar from "@/components/Navbar";
import CameraStage from "@/components/CameraStage";
import ClassManager from "@/components/ClassManager";
import ConfirmDialog from "@/components/ConfirmDialog";
import {
  CapturedSample,
  DetectedHand,
  PoseClassMeta,
  PredictionResult,
  TrainedModelRecord,
  TrainingConfig,
  TrainingHistoryPoint,
} from "@/types/handpose";
import {
  CLASS_COLORS,
  extractFeatureVector,
  getClassColor,
} from "@/lib/landmarks";
import {
  deserializeTFModel,
  ensureTFBackend,
  evaluateKNN,
  predictWithKNN,
  predictWithMLP,
  trainMLPClassifier,
} from "@/lib/classifier";
import {
  loadPreferencesFromLocalStorage,
  loadWorkspaceLocally,
  saveModelLocally,
  savePreferencesToLocalStorage,
  saveWorkspaceLocally,
} from "@/lib/storage";
import { exportDatasetZip, exportTrainedModelZip } from "@/lib/export";
import { generateDemoDataset } from "@/lib/demoData";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CameraOff,
  CheckCircle2,
  FolderPlus,
  Layers,
  Sparkles,
  X,
} from "lucide-react";

const TrainerPanel = dynamic(() => import("@/components/TrainerPanel"), {
  ssr: false,
});
const DatasetHubModal = dynamic(() => import("@/components/DatasetHubModal"), {
  ssr: false,
});
const TutorialModal = dynamic(() => import("@/components/TutorialModal"), {
  ssr: false,
});
const KofiModal = dynamic(() => import("@/components/KofiModal"), {
  ssr: false,
});

const INITIAL_CLASSES: PoseClassMeta[] = [
  { name: "Thumbs Up", color: getClassColor(0), createdAt: 1 },
  { name: "Peace", color: getClassColor(1), createdAt: 2 },
];

export default function HandPoseStudioPage() {
  const [classes, setClasses] = useState<PoseClassMeta[]>(INITIAL_CLASSES);
  const [samples, setSamples] = useState<CapturedSample[]>([]);
  const [activeClassName, setActiveClassName] = useState<string | null>(
    INITIAL_CLASSES[0].name
  );

  // Step-by-step workspace view to prevent overwhelming the user
  const [activeStepTab, setActiveStepTab] = useState<
    "collect" | "train" | "all"
  >("collect");

  // MediaPipe & Telemetry State
  const [modelReady, setModelReady] = useState(false);
  const [fps, setFps] = useState(0);
  const [isBursting, setIsBursting] = useState(false);
  const lastFpsUpdateRef = useRef<number>(0);
  const lastPredictionTimeRef = useRef<number>(0);
  const [syncStatus, setSyncStatus] = useState<
    "saved" | "saving" | "idle" | "error"
  >("saved");

  // Classifier & Training State
  const [trainingConfig, setTrainingConfig] = useState<TrainingConfig>({
    classifierType: "mlp",
    epochs: 45,
    learningRate: 0.005,
    batchSize: 16,
    hiddenUnits: 64,
    useAugmentation: true,
  });
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState<
    TrainingHistoryPoint[]
  >([]);
  const [trainedModelRecord, setTrainedModelRecord] =
    useState<TrainedModelRecord | null>(null);
  const tfModelRef = useRef<tf.LayersModel | null>(null);
  const [livePrediction, setLivePrediction] =
    useState<PredictionResult | null>(null);

  // Modals, Confirm Dialog & Non-blocking Toast Banner
  const [hubOpen, setHubOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [kofiOpen, setKofiOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const [toastNotice, setToastNotice] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    variant: "danger" | "warning" | "primary";
    onConfirm: () => void;
  } | null>(null);

  const collectTabRef = useRef<HTMLButtonElement | null>(null);
  const trainTabRef = useRef<HTMLButtonElement | null>(null);

  const showToast = useCallback(
    (text: string, type: "success" | "error" | "info" = "info") => {
      setToastNotice({ type, text });
    },
    []
  );

  useEffect(() => {
    if (!toastNotice) return;
    const t = setTimeout(() => setToastNotice(null), 4000);
    return () => clearTimeout(t);
  }, [toastNotice]);

  // Only pause hardware webcam stream when a full-screen workflow modal is open (not during quick sample thumbnail inspection)
  const isFullModalOpen = hubOpen || tutorialOpen || kofiOpen;

  // Warm up TF.js backend lazily when user opens Step 2
  useEffect(() => {
    if (activeStepTab === "train" || activeStepTab === "all") {
      ensureTFBackend().catch(() => {});
    }
  }, [activeStepTab]);

  // Load persisted workspace & preferences from browser storage on mount
  useEffect(() => {
    let mounted = true;
    async function hydrate() {
      const prefs = loadPreferencesFromLocalStorage();
      if (!prefs.hasCompletedTutorial) {
        setTutorialOpen(true);
      }
      setShowHelp(!prefs.hideQuickGuide);

      const saved = await loadWorkspaceLocally();
      if (!mounted) return;

      if (saved && Array.isArray(saved.classes)) {
        setClasses(saved.classes);
        setSamples(saved.samples || []);
        setActiveClassName(saved.classes[0]?.name || null);

        if (saved.activeModel) {
          setTrainedModelRecord(saved.activeModel);
          setTrainingConfig((prev) => ({
            ...prev,
            classifierType: saved.activeModel!.classifierType,
          }));
          if (saved.activeModel.serializedModel) {
            try {
              const restored = await deserializeTFModel(
                saved.activeModel.serializedModel
              );
              if (mounted) {
                tfModelRef.current = restored;
              } else {
                restored.dispose();
              }
            } catch (err) {
              console.warn(
                "Could not restore TF.js model from local storage:",
                err
              );
            }
          }
        }
      }
      setHydrated(true);
    }
    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  // Keep a reference to latest workspace state for debounced & max-wait flushes
  const latestStateRef = useRef({ classes, samples, trainedModelRecord });
  latestStateRef.current = { classes, samples, trainedModelRecord };
  const maxWaitTimerRef = useRef<NodeJS.Timeout | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-save workspace with debounce (350ms), deferring writes during active Auto-Burst or MLP training
  useEffect(() => {
    if (!hydrated || isBursting || isTraining) return;
    setSyncStatus("saving");

    const flushSave = async () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (maxWaitTimerRef.current) {
        clearTimeout(maxWaitTimerRef.current);
        maxWaitTimerRef.current = null;
      }
      const {
        classes: c,
        samples: s,
        trainedModelRecord: m,
      } = latestStateRef.current;
      try {
        await saveWorkspaceLocally(c, s, m);
        setSyncStatus("saved");
      } catch (err) {
        console.error("Auto-save failed:", err);
        setSyncStatus("error");
      }
    };

    if (!maxWaitTimerRef.current) {
      maxWaitTimerRef.current = setTimeout(flushSave, 1500);
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(flushSave, 400);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [classes, samples, trainedModelRecord, hydrated, isBursting, isTraining]);

  // Clean up any lingering timers and TF.js model on unmount
  useEffect(() => {
    return () => {
      if (maxWaitTimerRef.current) clearTimeout(maxWaitTimerRef.current);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (tfModelRef.current) {
        tfModelRef.current.dispose();
        tfModelRef.current = null;
      }
    };
  }, []);

  const activeClass =
    classes.find((c) => c.name === activeClassName) || classes[0] || null;

  // Class & Sample handlers
  const handleAddClass = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const currentClasses = latestStateRef.current.classes;
    const existing = currentClasses.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      setActiveClassName(existing.name);
      return;
    }
    setClasses((prev) => {
      const usedColors = new Set(prev.map((c) => c.color));
      const unusedColor =
        CLASS_COLORS.find((color) => !usedColors.has(color)) ||
        getClassColor(prev.length);
      return [
        ...prev,
        {
          name: trimmed,
          color: unusedColor,
          createdAt: Date.now(),
        },
      ];
    });
    setActiveClassName(trimmed);
  }, []);

  const clearActiveModel = useCallback(() => {
    setTrainedModelRecord(null);
    setTrainingProgress([]);
    setLivePrediction(null);
    if (tfModelRef.current) {
      tfModelRef.current.dispose();
      tfModelRef.current = null;
    }
  }, []);

  const handleRenameClass = useCallback(
    (oldName: string, newName: string) => {
      const trimmed = newName.trim();
      if (!trimmed || trimmed === oldName) return;

      const currentClasses = latestStateRef.current.classes;
      const exists = currentClasses.some(
        (c) =>
          c.name.toLowerCase() === trimmed.toLowerCase() &&
          c.name.toLowerCase() !== oldName.toLowerCase()
      );
      if (exists) {
        showToast(`A class named "${trimmed}" already exists.`, "error");
        return;
      }

      setClasses((prev) =>
        prev.map((c) => (c.name === oldName ? { ...c, name: trimmed } : c))
      );

      setSamples((prev) =>
        prev.map((s) =>
          s.className === oldName ? { ...s, className: trimmed } : s
        )
      );

      setActiveClassName((prev) => (prev === oldName ? trimmed : prev));

      // Keep active model class labels & exemplars in sync if model was trained on old name
      setTrainedModelRecord((prev) => {
        if (!prev || !prev.classes.includes(oldName)) return prev;
        return {
          ...prev,
          classes: prev.classes.map((cls) =>
            cls === oldName ? trimmed : cls
          ),
          knnExemplars: prev.knnExemplars?.map((ex) =>
            ex.className === oldName ? { ...ex, className: trimmed } : ex
          ),
        };
      });
    },
    [showToast]
  );

  const executeDeleteClass = useCallback(
    (name: string) => {
      const {
        classes: currentClasses,
        trainedModelRecord: currentModel,
      } = latestStateRef.current;
      const nextClasses = currentClasses.filter((c) => c.name !== name);
      setSamples((prev) => prev.filter((s) => s.className !== name));
      setClasses(nextClasses);
      setActiveClassName((curr) =>
        curr === name ? nextClasses[0]?.name || null : curr
      );

      if (currentModel?.classes.includes(name)) {
        clearActiveModel();
      }
      showToast(`Deleted class "${name}".`, "info");
    },
    [clearActiveModel, showToast]
  );

  const handleDeleteClass = useCallback(
    (name: string) => {
      const { samples: currentSamples } = latestStateRef.current;
      const sampleCount = currentSamples.filter(
        (s) => s.className === name
      ).length;

      setConfirmState({
        title: `Delete "${name}"?`,
        description:
          sampleCount > 0
            ? `This will permanently delete the "${name}" class and its ${sampleCount} captured ${
                sampleCount === 1 ? "sample" : "samples"
              }. This cannot be undone.`
            : `Are you sure you want to delete the "${name}" pose class?`,
        confirmLabel: "Delete Class",
        variant: "danger",
        onConfirm: () => {
          setConfirmState(null);
          executeDeleteClass(name);
        },
      });
    },
    [executeDeleteClass]
  );

  const handleCaptureSample = useCallback((sample: CapturedSample) => {
    setSamples((prev) => [...prev, sample]);
  }, []);

  const handleDeleteSample = useCallback((id: string) => {
    setSamples((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const handleClearWorkspace = useCallback(() => {
    const currentSamples = latestStateRef.current.samples;
    if (currentSamples.length === 0) return;

    setConfirmState({
      title: "Clear All Captured Samples?",
      description: `This will remove all ${currentSamples.length} captured ${
        currentSamples.length === 1 ? "sample" : "samples"
      } and reset the active model. Your pose class names will be kept. This cannot be undone.`,
      confirmLabel: "Clear All Samples",
      variant: "danger",
      onConfirm: () => {
        setConfirmState(null);
        clearActiveModel();
        setSamples([]);
        showToast("Cleared all captured samples.", "info");
      },
    });
  }, [clearActiveModel, showToast]);

  const executeLoadDemoDataset = useCallback(() => {
    clearActiveModel();
    const demo = generateDemoDataset(8);
    setClasses(demo.classes);
    setSamples(demo.samples);
    setActiveClassName(demo.classes[0].name);
    showToast(
      "Loaded 32 synthetic 3D hand pose samples across 4 classes!",
      "success"
    );
  }, [clearActiveModel, showToast]);

  const handleLoadDemoDataset = useCallback(() => {
    const currentSamples = latestStateRef.current.samples;
    if (currentSamples.length > 0) {
      setConfirmState({
        title: "Replace Current Samples with Demo Data?",
        description: `Loading the 32-sample Demo Dataset will replace your ${currentSamples.length} currently captured ${
          currentSamples.length === 1 ? "sample" : "samples"
        }. You can save a snapshot in 'Export & Backups' first if you want to keep your current work.`,
        confirmLabel: "Load Demo Dataset",
        variant: "warning",
        onConfirm: () => {
          setConfirmState(null);
          executeLoadDemoDataset();
        },
      });
      return;
    }
    executeLoadDemoDataset();
  }, [executeLoadDemoDataset]);

  // Memoize extracted feature vectors for all samples in the workspace
  // so k-NN does not re-extract features on every video frame
  const workspaceExemplars = useMemo(() => {
    return samples
      .map((s) => ({
        className: s.className,
        vec: extractFeatureVector(s.hands),
      }))
      .filter(
        (s): s is { className: string; vec: number[] } => s.vec !== null
      );
  }, [samples]);

  // Real-time hand detection callback + live hand pose classification (throttled to avoid React re-render cascades)
  const handleHandsDetected = useCallback(
    (detectedHands: DetectedHand[], currentFps: number) => {
      const now = performance.now();
      if (currentFps === 0 || now - lastFpsUpdateRef.current >= 800) {
        lastFpsUpdateRef.current = now;
        setFps(currentFps);
      }

      if (!detectedHands || detectedHands.length === 0) {
        setLivePrediction(null);
        return;
      }

      if (now - lastPredictionTimeRef.current < 70) {
        return;
      }
      lastPredictionTimeRef.current = now;

      // Respect the currently selected classifier engine first so switching between MLP and k-NN is immediate
      if (
        trainingConfig.classifierType === "knn" &&
        workspaceExemplars.length >= 2
      ) {
        const pred = predictWithKNN(
          workspaceExemplars,
          detectedHands,
          classes,
          5
        );
        setLivePrediction(pred);
      } else if (
        trainedModelRecord?.classifierType === "mlp" &&
        tfModelRef.current
      ) {
        const pred = predictWithMLP(
          tfModelRef.current,
          trainedModelRecord.classes,
          detectedHands,
          classes
        );
        setLivePrediction(pred);
      } else if (
        trainedModelRecord?.classifierType === "knn" &&
        workspaceExemplars.length >= 2
      ) {
        const pred = predictWithKNN(
          workspaceExemplars,
          detectedHands,
          classes,
          5
        );
        setLivePrediction(pred);
      } else {
        setLivePrediction(null);
      }
    },
    [
      trainedModelRecord,
      trainingConfig.classifierType,
      workspaceExemplars,
      classes,
    ]
  );

  const handleExportModelZip = useCallback(async () => {
    if (!trainedModelRecord) return;
    try {
      await exportTrainedModelZip(trainedModelRecord);
      showToast(
        `Exported "${trainedModelRecord.name}" bundle (.zip).`,
        "success"
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to export model.",
        "error"
      );
    }
  }, [trainedModelRecord, showToast]);

  const handleQuickDownloadZip = useCallback(async () => {
    try {
      await exportDatasetZip(classes, samples, "handpose-dataset");
      showToast(
        `Exported ${samples.length} samples across ${classes.length} classes (.zip).`,
        "success"
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Failed to export dataset ZIP.",
        "error"
      );
    }
  }, [classes, samples, showToast]);

  const handleSaveModelLocally = useCallback(async () => {
    if (trainedModelRecord) {
      await saveModelLocally(trainedModelRecord);
    }
  }, [trainedModelRecord]);

  // Train classifier in browser
  const handleStartTraining = async () => {
    if (isTraining) return;

    if (trainingConfig.classifierType === "knn") {
      if (tfModelRef.current) {
        tfModelRef.current.dispose();
        tfModelRef.current = null;
      }
      setTrainingProgress([]);

      const evalResult = evaluateKNN(workspaceExemplars, 5);

      const record: TrainedModelRecord = {
        id: `knn_${Date.now()}`,
        name: `k-NN Pose Classifier (${evalResult.classes.length} classes)`,
        classifierType: "knn",
        classes: evalResult.classes,
        sampleCount: samples.length,
        finalAccuracy: evalResult.accuracy,
        finalLoss: 0,
        epochs: 1,
        trainedAt: Date.now(),
        history: [],
        knnExemplars: workspaceExemplars,
      };
      setTrainedModelRecord(record);
      showToast(
        `k-NN Leave-One-Out accuracy evaluated: ${evalResult.accuracy}% across ${evalResult.classes.length} classes.`,
        "success"
      );
      return;
    }

    try {
      setIsTraining(true);
      setTrainingProgress([]);

      // Give React one frame to paint the button's loading state & spinner immediately
      await new Promise((resolve) => setTimeout(resolve, 60));

      const result = await trainMLPClassifier(
        samples,
        trainingConfig,
        (point) => {
          setTrainingProgress((prev) => [...prev, point]);
        }
      );

      if (tfModelRef.current) {
        tfModelRef.current.dispose();
      }
      tfModelRef.current = result.model;

      const lastPt = result.history[result.history.length - 1];
      const finalAcc = lastPt?.valAccuracy ?? lastPt?.accuracy ?? 100;
      const record: TrainedModelRecord = {
        id: `mlp_${Date.now()}`,
        name: `TF.js MLP (${result.classes.length} classes)`,
        classifierType: "mlp",
        classes: result.classes,
        sampleCount: samples.length,
        finalAccuracy: finalAcc,
        finalLoss: lastPt?.loss ?? 0,
        epochs: trainingConfig.epochs,
        trainedAt: Date.now(),
        history: result.history,
        serializedModel: result.serializedModel,
      };

      setTrainedModelRecord(record);
      showToast(
        `Trained TF.js Neural Network (${finalAcc}% accuracy across ${result.classes.length} classes)!`,
        "success"
      );
    } catch (err) {
      console.error("Training error:", err);
      showToast(
        err instanceof Error ? err.message : "Failed to train neural network",
        "error"
      );
    } finally {
      setIsTraining(false);
    }
  };

  const handleRestoreModel = async (model: TrainedModelRecord) => {
    if (tfModelRef.current) {
      tfModelRef.current.dispose();
      tfModelRef.current = null;
    }
    setTrainedModelRecord(model);
    setTrainingProgress(model.history || []);
    setTrainingConfig((prev) => ({
      ...prev,
      classifierType: model.classifierType,
    }));

    if (model.serializedModel) {
      try {
        const restored = await deserializeTFModel(model.serializedModel);
        tfModelRef.current = restored;
      } catch (err) {
        console.error("Failed to deserialize model:", err);
      }
    }
    showToast(`Activated model "${model.name}".`, "success");
  };

  const handleToggleQuickGuide = () => {
    setShowHelp((prev) => {
      const next = !prev;
      if (typeof document !== "undefined") {
        if (!next) {
          document.documentElement.dataset.hideGuide = "true";
        } else {
          delete document.documentElement.dataset.hideGuide;
        }
      }
      savePreferencesToLocalStorage({ hideQuickGuide: !next });
      return next;
    });
  };

  const handleCloseTutorial = () => {
    setTutorialOpen(false);
    setShowHelp(false);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.hideGuide = "true";
    }
    savePreferencesToLocalStorage({
      hasCompletedTutorial: true,
      hideQuickGuide: true,
    });
  };

  const handleStepTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      if (activeStepTab === "collect") {
        setActiveStepTab("train");
        trainTabRef.current?.focus();
      } else {
        setActiveStepTab("collect");
        collectTabRef.current?.focus();
      }
    }
  };

  // Count how many classes have at least 1 sample
  const readyClassCount = new Set(samples.map((s) => s.className)).size;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <Navbar
        modelReady={modelReady}
        fps={fps}
        totalSamples={samples.length}
        totalClasses={classes.length}
        hasTrainedModel={Boolean(trainedModelRecord)}
        trainedAccuracy={trainedModelRecord?.finalAccuracy}
        syncStatus={syncStatus}
        onOpenHub={() => setHubOpen(true)}
        onQuickDownloadZip={handleQuickDownloadZip}
        onLoadDemoData={handleLoadDemoDataset}
        onOpenTutorial={() => setTutorialOpen(true)}
        onToggleHelp={handleToggleQuickGuide}
        onOpenKofi={() => setKofiOpen(true)}
      />

      {/* Non-blocking Toast Notification Banner */}
      {toastNotice && (
        <div
          role={toastNotice.type === "error" ? "alert" : "status"}
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 flex max-w-md items-center gap-2.5 rounded-xl border px-4 py-3 text-xs font-semibold shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-150"
          style={{
            backgroundColor:
              toastNotice.type === "error"
                ? "rgba(69, 10, 10, 0.95)"
                : toastNotice.type === "success"
                ? "rgba(6, 46, 34, 0.95)"
                : "rgba(14, 33, 53, 0.95)",
            borderColor:
              toastNotice.type === "error"
                ? "rgba(244, 63, 94, 0.5)"
                : toastNotice.type === "success"
                ? "rgba(16, 185, 129, 0.5)"
                : "rgba(56, 189, 248, 0.4)",
          }}
        >
          {toastNotice.type === "error" ? (
            <AlertTriangle
              className="h-4 w-4 shrink-0 text-rose-400"
              aria-hidden="true"
            />
          ) : (
            <CheckCircle2
              className="h-4 w-4 shrink-0 text-emerald-400"
              aria-hidden="true"
            />
          )}
          <span className="text-slate-100">{toastNotice.text}</span>
          <button
            type="button"
            onClick={() => setToastNotice(null)}
            aria-label="Dismiss notification"
            className="ml-1 rounded p-1 text-slate-300 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Quick Studio Guide Banner (Aligned with Step 1, Step 2, and Export) */}
      {showHelp && (
        <div
          id="quick-studio-guide"
          className="border-b border-ocean-700/60 bg-gradient-to-r from-[#102337]/95 via-[#132d47]/95 to-[#102337]/95 px-3.5 py-3 sm:px-6 shadow-sm"
        >
          <div className="mx-auto flex max-w-[1600px] items-start justify-between gap-3">
            <div className="flex flex-col gap-2 text-xs text-slate-200">
              <div className="flex items-center gap-2 font-bold text-[#FFE79C] text-sm">
                <BookOpen
                  className="h-4 w-4 shrink-0 text-terracotta-400"
                  aria-hidden="true"
                />
                <span>Quick Studio Guide:</span>
              </div>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3 text-slate-200">
                <div className="flex items-start gap-2 rounded-xl border border-ocean-700/50 bg-[#0b1929]/60 p-2.5">
                  <span className="shrink-0 rounded-md bg-terracotta-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
                    Step 1
                  </span>
                  <div className="leading-relaxed">
                    <strong>Collect Pose Samples:</strong> Select a class and
                    press{" "}
                    <kbd className="rounded border border-ocean-600/60 bg-[#0a1725] px-1.5 py-0.5 font-mono text-xs text-slate-100">
                      Space
                    </kbd>{" "}
                    or <strong>Auto-Burst</strong> (or click{" "}
                    <em>Demo Data</em> to load 32 ready-made poses).
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-xl border border-ocean-700/50 bg-[#0b1929]/60 p-2.5">
                  <span className="shrink-0 rounded-md bg-ocean-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
                    Step 2
                  </span>
                  <div className="leading-relaxed">
                    <strong>Train &amp; Test Live:</strong> Train a custom{" "}
                    <strong>TF.js Neural Network</strong> in ~1 second (or use{" "}
                    <strong>Instant k-NN</strong>) and test live on your webcam.
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-xl border border-ocean-700/50 bg-[#0b1929]/60 p-2.5">
                  <span className="shrink-0 rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm">
                    Export
                  </span>
                  <div className="leading-relaxed">
                    <strong>100% Local &amp; Portable:</strong> Everything
                    auto-saves in your browser. Export datasets as{" "}
                    <strong>.zip</strong> / <strong>.csv</strong> or download
                    your <strong>TF.js model</strong> anytime.
                  </div>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleQuickGuide}
              title="Dismiss Quick Studio Guide"
              aria-label="Dismiss Quick Studio Guide"
              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg p-1.5 text-slate-300 hover:bg-[#1a3857] hover:text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Studio Grid */}
      <main className="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-5 p-3.5 sm:p-6 lg:grid-cols-12">
        {/* Left Column: Live Camera + MediaPipe 3D Stage (5 cols on lg) */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Sentry.ErrorBoundary
            fallback={({ error, resetError }) => (
              <div className="flex flex-col items-center justify-center p-8 rounded-2xl border border-red-500/30 bg-red-950/20 text-center text-slate-200">
                <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 mb-3">
                  <CameraOff className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-white mb-1">
                  Camera Stage Error
                </h3>
                <p className="text-xs text-slate-300 max-w-sm mb-4">
                  {error instanceof Error
                    ? error.message
                    : "An unexpected camera stage error occurred."}
                </p>
                <button
                  type="button"
                  onClick={() => resetError()}
                  className="px-4 py-2 rounded-xl bg-ocean-600 hover:bg-ocean-500 text-xs font-medium text-white transition-colors"
                >
                  Restart Camera Stage
                </button>
              </div>
            )}
          >
            <CameraStage
              activeClass={activeClass}
              classes={classes}
              onSelectClass={setActiveClassName}
              onCaptureSample={handleCaptureSample}
              onHandsDetected={handleHandsDetected}
              onModelStatusChange={setModelReady}
              onBurstStateChange={setIsBursting}
              livePrediction={livePrediction}
              classifierActive={
                Boolean(trainedModelRecord) ||
                (trainingConfig.classifierType === "knn" &&
                  workspaceExemplars.length >= 2)
              }
              isPaused={isFullModalOpen}
            />
          </Sentry.ErrorBoundary>

          {/* Helpful Starter Callout when 0 samples exist */}
          {samples.length === 0 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-ocean-600/50 bg-[#122840]/75 p-3.5 text-xs shadow-md">
              <div className="flex items-center gap-2.5">
                <Sparkles
                  className="h-4 w-4 text-gold-300 shrink-0"
                  aria-hidden="true"
                />
                <span className="text-slate-200">
                  No webcam handy? Load 32 synthetic 3D hand poses to test
                  training and exports right away.
                </span>
              </div>
              <button
                type="button"
                onClick={handleLoadDemoDataset}
                className="min-h-[38px] shrink-0 w-full sm:w-auto rounded-lg bg-gradient-to-r from-terracotta-600 to-terracotta-700 px-3.5 py-1.5 font-bold text-white shadow-sm shadow-terracotta-950/40 transition hover:from-terracotta-500 hover:to-terracotta-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-300"
              >
                Load Demo Data
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Guided Step Tabs (7 cols on lg) */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          {/* Step Switcher Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-ocean-700/60 bg-[#0e1d2e]/90 p-2 shadow-lg">
            <div
              role="tablist"
              aria-label="Workflow Steps"
              className="flex flex-1 items-center gap-1.5"
            >
              <button
                ref={collectTabRef}
                id="step-tab-collect"
                type="button"
                role="tab"
                aria-selected={
                  activeStepTab === "collect" || activeStepTab === "all"
                }
                aria-controls="step-panel-collect"
                tabIndex={activeStepTab === "train" ? -1 : 0}
                onKeyDown={handleStepTabKeyDown}
                onClick={() => setActiveStepTab("collect")}
                title={`Step 1: Collect (${samples.length} photos captured)`}
                className={`flex min-h-[40px] flex-1 items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2 sm:px-3.5 py-2 text-xs font-bold transition min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 ${
                  activeStepTab === "collect"
                    ? "bg-gradient-to-r from-terracotta-600 to-terracotta-700 text-white shadow-md shadow-terracotta-950/30"
                    : "text-slate-200 hover:bg-[#16304d]"
                }`}
              >
                <FolderPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">
                  Step 1: Collect ({samples.length})
                </span>
              </button>

              <button
                ref={trainTabRef}
                id="step-tab-train"
                type="button"
                role="tab"
                aria-selected={
                  activeStepTab === "train" || activeStepTab === "all"
                }
                aria-controls="step-panel-train"
                tabIndex={activeStepTab === "train" ? 0 : -1}
                onKeyDown={handleStepTabKeyDown}
                onClick={() => setActiveStepTab("train")}
                title={`Step 2: Train & Test${
                  trainedModelRecord
                    ? ` (${trainedModelRecord.finalAccuracy}% Accuracy)`
                    : ""
                }`}
                className={`flex min-h-[40px] flex-1 items-center justify-center gap-1 sm:gap-2 rounded-xl px-2 sm:px-3.5 py-2 text-xs font-bold transition min-w-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  activeStepTab === "train"
                    ? "bg-ocean-600 text-white shadow-md shadow-ocean-950/30"
                    : "text-slate-200 hover:bg-[#16304d]"
                }`}
              >
                <BrainCircuit className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">Step 2: Train &amp; Test</span>
                {trainedModelRecord && (
                  <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-xs font-mono text-emerald-300 border border-emerald-500/30 shrink-0">
                    {trainedModelRecord.finalAccuracy}%
                  </span>
                )}
              </button>
            </div>

            <button
              type="button"
              aria-pressed={activeStepTab === "all"}
              onClick={() =>
                setActiveStepTab((prev) =>
                  prev === "all" ? "collect" : "all"
                )
              }
              title={
                activeStepTab === "all"
                  ? "Switch to single-step tabbed view"
                  : "Stack Step 1 and Step 2 together"
              }
              aria-label={
                activeStepTab === "all"
                  ? "Switch to single-step tabbed view"
                  : "Stack Step 1 and Step 2 together"
              }
              className={`flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                activeStepTab === "all"
                  ? "border-gold-300/40 bg-gold-200/15 text-gold-200"
                  : "border-ocean-700/60 bg-[#091522] text-slate-200 hover:text-white"
              }`}
            >
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">
                {activeStepTab === "all" ? "Tabbed View" : "Stack Steps"}
              </span>
            </button>
          </div>

          {/* Step 1 Panel: Collect Poses */}
          {(activeStepTab === "collect" || activeStepTab === "all") && (
            <div
              role="tabpanel"
              id="step-panel-collect"
              aria-labelledby="step-tab-collect"
              className="flex flex-col gap-4"
            >
              <ClassManager
                classes={classes}
                samples={samples}
                activeClassName={activeClass?.name || null}
                onSelectClass={setActiveClassName}
                onAddClass={handleAddClass}
                onRenameClass={handleRenameClass}
                onDeleteClass={handleDeleteClass}
                onDeleteSample={handleDeleteSample}
                onClearAll={handleClearWorkspace}
                isTraining={isTraining}
              />

              {/* Next Step Callout Banner when user has collected >=2 classes in Tabbed mode */}
              {activeStepTab === "collect" && readyClassCount >= 2 && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/30 p-3.5 text-xs shadow-md">
                  <span className="text-emerald-200">
                    Awesome! You have samples for{" "}
                    <strong>{readyClassCount} classes</strong> ({samples.length}{" "}
                    total photos). Ready to train your hand pose classifier?
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveStepTab("train")}
                    className="flex min-h-[40px] shrink-0 w-full sm:w-auto items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2 font-bold text-slate-950 transition hover:bg-emerald-400 shadow-md shadow-emerald-950/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
                  >
                    <span>Go to Step 2: Train Model</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 2 Panel: Train & Test Live */}
          {(activeStepTab === "train" || activeStepTab === "all") && (
            <div
              role="tabpanel"
              id="step-panel-train"
              aria-labelledby="step-tab-train"
            >
              <Sentry.ErrorBoundary
                fallback={({ error, resetError }) => (
                  <div className="flex flex-col items-center justify-center p-8 rounded-2xl border border-red-500/30 bg-red-950/20 text-center text-slate-200">
                    <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 mb-3">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-white mb-1">
                      Trainer Panel Error
                    </h3>
                    <p className="text-xs text-slate-300 max-w-sm mb-4">
                      {error instanceof Error
                        ? error.message
                        : "An unexpected trainer panel error occurred."}
                    </p>
                    <button
                      type="button"
                      onClick={() => resetError()}
                      className="px-4 py-2 rounded-xl bg-ocean-600 hover:bg-ocean-500 text-xs font-medium text-white transition-colors"
                    >
                      Retry Trainer Panel
                    </button>
                  </div>
                )}
              >
                <TrainerPanel
                  samples={samples}
                  config={trainingConfig}
                  onChangeConfig={setTrainingConfig}
                  isTraining={isTraining}
                  trainingProgress={trainingProgress}
                  trainedModel={trainedModelRecord}
                  livePrediction={livePrediction}
                  onStartTraining={handleStartTraining}
                  onExportModelZip={handleExportModelZip}
                  onSaveModelLocally={handleSaveModelLocally}
                />
              </Sentry.ErrorBoundary>
            </div>
          )}
        </div>
      </main>

      {/* Interactive Onboarding Walkthrough Modal */}
      {tutorialOpen && (
        <TutorialModal
          isOpen={tutorialOpen}
          onClose={handleCloseTutorial}
          onLoadDemoAndClose={() => {
            executeLoadDemoDataset();
            handleCloseTutorial();
          }}
        />
      )}

      {/* Datasets, Local Browser Snapshots & Export Hub Modal */}
      {hubOpen && (
        <DatasetHubModal
          isOpen={hubOpen}
          onClose={() => setHubOpen(false)}
          classes={classes}
          samples={samples}
          activeModel={trainedModelRecord}
          onRestoreWorkspace={(newClasses, newSamples) => {
            clearActiveModel();
            setClasses(newClasses);
            setSamples(newSamples);
            setActiveClassName(newClasses[0]?.name || null);
          }}
          onRestoreModel={handleRestoreModel}
        />
      )}

      {/* Ko-fi Support & Donation Widget Modal */}
      {kofiOpen && (
        <KofiModal
          isOpen={kofiOpen}
          onClose={() => setKofiOpen(false)}
          username="ongyiumark"
        />
      )}

      {/* Accessible Non-Blocking Confirmation Modal */}
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
