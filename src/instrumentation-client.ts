// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  (typeof window !== "undefined" &&
  window.location.hostname === "handpose.ongyiumark.com"
    ? "https://1fea65c54eb54e8a3c14bd7ec727030b@o4507947215749120.ingest.de.sentry.io/4512354541109328"
    : undefined);

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: Boolean(SENTRY_DSN),
  dataCollection: {
    userInfo: false,
    httpBodies: [],
  },

  // Add optional integrations for additional features
  integrations: [
    Sentry.replayIntegration({
      // Mask all text and strictly block all camera video/canvas/image elements to guarantee webcam & dataset privacy
      maskAllText: true,
      blockAllMedia: true,
      block: [".sentry-block", "video", "canvas", "img"],
    }),
    Sentry.feedbackIntegration({
      colorScheme: "dark",
      buttonLabel: "Feedback / Bug",
      submitButtonLabel: "Send Feedback",
      formTitle: "Send Anonymous Feedback or Bug Report",
    }),
  ],

  // In development, trace 100% of transactions. In production, 20% captures rich performance metrics without hitting quota.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Replay sampling: Don't record passive error-free sessions, but capture 100% of sessions when an unhandled error occurs.
  replaysSessionSampleRate: 0.0,
  replaysOnErrorSampleRate: 1.0,

  // Ignore benign client-side errors and camera permission dismissals
  ignoreErrors: [
    "ResizeObserver loop completed with undelivered notifications.",
    "ResizeObserver loop limit exceeded",
    "NotAllowedError: Permission denied",
    "AbortError: The play() request was interrupted",
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
