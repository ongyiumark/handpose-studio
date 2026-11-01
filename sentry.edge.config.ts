// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://1fea65c54eb54e8a3c14bd7ec727030b@o4507947215749120.ingest.de.sentry.io/4512354541109328",

  // In development, trace 100% of transactions. In production, 20% captures rich performance metrics without hitting quota.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  dataCollection: {
    // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#dataCollection
    // userInfo: false,
    // httpBodies: [],
  },
});
