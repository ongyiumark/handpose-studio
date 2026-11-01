// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://1fea65c54eb54e8a3c14bd7ec727030b@o4507947215749120.ingest.de.sentry.io/4512354541109328",

  // Add optional integrations for additional features
  integrations: [
    Sentry.replayIntegration({
      // Mask text and strictly block camera video/canvas elements to guarantee webcam privacy and low replay overhead
      maskAllText: false,
      block: [".sentry-block", "video", "canvas"],
    }),
    Sentry.feedbackIntegration({
      colorScheme: "system",
      buttonLabel: "Report Bug",
      submitButtonLabel: "Submit Feedback",
      formTitle: "Report a Bug / Feedback",
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

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
