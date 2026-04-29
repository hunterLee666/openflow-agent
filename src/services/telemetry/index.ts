export * from './types'
export * from './collector'
export {
  TelemetryQueue as TelemetryQueueV2,
  DEFAULT_CONFIG as DEFAULT_TELEMETRY_CONFIG,
  getTelemetryQueue,
  resetTelemetryQueue,
  trackEvent,
  trackPerformance,
  span,
} from './TelemetryQueue'
export type { TelemetryConfig } from './TelemetryQueue'
export { initSentry, captureException } from './sentry'
