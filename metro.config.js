const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro uses separate transform and file-map worker pools. Keep Windows file
// concurrency bounded to avoid EMFILE errors while reading the shared cache.
if (process.platform === 'win32') {
  config.maxWorkers = Math.min(config.maxWorkers ?? 2, 2);
}

module.exports = config;
