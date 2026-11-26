/**
 * API + order worker + simulator in ONE process.
 *
 * Used on Render's free plan, where only web services are free (background
 * workers cost money). Locally and in Docker each part runs as its own
 * process, which is what you'd do in production with real traffic: scale the
 * API and the workers separately.
 *
 *   node src/all-in-one.js
 */
await import('./index.js');
await import('./worker.js');
await import('./simulator.js');
console.log('All-in-one mode: API + worker + simulator running in one process');
