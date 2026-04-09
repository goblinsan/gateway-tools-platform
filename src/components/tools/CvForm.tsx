"use client";

import { useRef, useState } from "react";

type CvOperation = "segment" | "analyze" | "palette";

interface SubmitState {
  status: "idle" | "uploading" | "success" | "error";
  artifactId?: string;
  mimeType?: string;
  sessionId?: string;
  error?: string;
}

const OPERATIONS: { value: CvOperation; label: string; description: string }[] =
  [
    {
      value: "segment",
      label: "Segmentation",
      description: "Identify and mask distinct objects using SAM.",
    },
    {
      value: "analyze",
      label: "Analyze",
      description: "Describe scene content and detected objects.",
    },
    {
      value: "palette",
      label: "Palette extraction",
      description: "Extract the dominant colour palette.",
    },
  ];

/**
 * Client component that renders the CV / SAM upload form, submits to the
 * broker API route, and displays the result inline.
 */
export function CvForm({ onComplete }: { onComplete?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [operation, setOperation] = useState<CvOperation>("analyze");
  const [state, setState] = useState<SubmitState>({ status: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setState({ status: "uploading" });

    const form = new FormData();
    form.append("image", file);
    form.append("operation", operation);

    try {
      const res = await fetch("/api/tools/cv", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setState({ status: "error", error: json.error ?? "Unknown error" });
        return;
      }
      setState({
        status: "success",
        artifactId: json.artifact?.id,
        mimeType: json.artifact?.mimeType,
        sessionId: json.session?.id,
      });
      onComplete?.();
    } catch {
      setState({ status: "error", error: "Network error – please try again" });
    }
  }

  function reset() {
    setState({ status: "idle" });
    if (fileRef.current) fileRef.current.value = "";
  }

  const isImage = state.mimeType?.startsWith("image/");

  return (
    <div className="space-y-6">
      {state.status !== "success" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="cv-image"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Image file
            </label>
            <input
              id="cv-image"
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/tiff,image/bmp"
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 file:mr-3 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              JPEG, PNG, WebP, TIFF, BMP — up to 10 MiB
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Operation
            </legend>
            <div className="mt-2 space-y-2">
              {OPERATIONS.map((op) => (
                <label
                  key={op.value}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 p-3 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50"
                >
                  <input
                    type="radio"
                    name="cv-operation"
                    value={op.value}
                    checked={operation === op.value}
                    onChange={() => setOperation(op.value)}
                    className="mt-0.5 h-4 w-4 border-zinc-300 text-indigo-600 focus:ring-indigo-500 dark:border-zinc-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {op.label}
                    </span>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      {op.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {state.status === "error" && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={state.status === "uploading"}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {state.status === "uploading" ? "Processing…" : "Process image"}
          </button>
        </form>
      )}

      {state.status === "success" && state.artifactId && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Result
            </h3>
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/artifacts/${state.artifactId}`}
                alt="CV result"
                className="mt-3 max-w-full rounded-lg"
              />
            ) : (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Result saved. Use the download button to view it.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={`/api/artifacts/${state.artifactId}`}
              download
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Download result
            </a>
            <button
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Process another image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
