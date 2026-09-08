// The retired demo schema cannot seed the current GTFS models.
// Use the validated GTFS importer against a backed-up staging database.
throw new Error('Demo seed retired. Use npm run import-gtfs -- --gtfs-dir <validated-feed-directory>.');
export {};
