import { liveConfig } from '../tests/live-config.mjs'
try {
  liveConfig()
  console.log('Local live-test configuration is complete. No network call was made; migration/authentication still require verification.')
} catch (error) { console.error(error.message); process.exitCode = 2 }
