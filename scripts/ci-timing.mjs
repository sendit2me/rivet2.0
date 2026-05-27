import { appendFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

function formatDuration(ms) {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

function escapeSummaryText(value) {
  return value.replaceAll('\\', '\\\\').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function startTimer() {
  return performance.now();
}

export async function reportTiming(label, startedAt) {
  const durationMs = performance.now() - startedAt;
  const formatted = formatDuration(durationMs);

  console.log(`Timing: ${label} took ${formatted}`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `- **${escapeSummaryText(label)}**: ${formatted}\n`);
    } catch (error) {
      console.warn(
        `Warning: failed to append timing to GITHUB_STEP_SUMMARY: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return durationMs;
}
