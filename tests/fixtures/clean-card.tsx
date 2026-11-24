import React, { useState } from 'react';

export interface DeploymentMeta {
  commitSha?: string;
}

export interface DeploymentCardProps {
  projectName: string;
  durationSeconds: number;
  meta?: DeploymentMeta;
  onDeploy: () => Promise<void>;
}

export function DeploymentCard({
  projectName,
  durationSeconds,
  meta,
  onDeploy,
}: DeploymentCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const commitRef = meta?.commitSha ?? 'HEAD';

  async function triggerProductionDeploy() {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onDeploy();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setErrorMessage(`Could not deploy ${projectName}: ${detail}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="rounded-xl border border-neutral-200/80 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-neutral-950">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-base font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
          {projectName}
        </h2>
        {/* Keep tabular-nums so duration updates never jitter adjacent layout */}
        <span className="font-mono text-xs tabular-nums text-neutral-600 dark:text-neutral-400">
          {durationSeconds}s · {commitRef}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
        Build and ship preview deployments on every pull request.
      </p>

      {errorMessage ? (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-5 flex items-center justify-end">
        <button
          type="button"
          disabled={submitting}
          onClick={triggerProductionDeploy}
          className="inline-flex items-center rounded-md bg-neutral-950 px-3.5 py-2 text-sm font-medium text-white transition-colors duration-150 ease-out hover:bg-neutral-800 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:bg-neutral-50 dark:text-neutral-950 dark:hover:bg-neutral-200"
        >
          {submitting ? 'Deploying...' : 'Deploy to production'}
        </button>
      </div>
    </article>
  );
}
