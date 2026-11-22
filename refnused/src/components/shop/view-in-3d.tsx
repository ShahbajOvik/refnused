"use client";

import { Rotate3dIcon, XIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type ViewerProps = { modelUrl: string; label: string; reducedMotion: boolean };

// three.js, R3F and drei only download when someone asks for the 3D view.
const Viewer360 = dynamic<ViewerProps>(() => import("./viewer-360"), {
  ssr: false,
  loading: ({ error }) => (
    <ViewerMessage>
      {error ? "The 3D model didn’t load. Please try again later." : "Loading 3D model…"}
    </ViewerMessage>
  ),
});

function ViewerMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      <p role="status">{children}</p>
    </div>
  );
}

function hasWebgl() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * "View in 3D" button. Opens a dialog with a 360° viewer of the model. The
 * photos stay the main way to see the phone; this is an extra, and falls
 * back to a message when the browser can't do WebGL.
 */
export function ViewIn3D({ modelUrl, modelName }: { modelUrl: string; modelName: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<
    { open: false } | { open: true; webgl: boolean; reducedMotion: boolean }
  >({ open: false });

  function open() {
    setState({
      open: true,
      webgl: hasWebgl(),
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
    dialog.current?.showModal();
  }

  function close() {
    dialog.current?.close();
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={open} className="min-h-11">
        <Rotate3dIcon aria-hidden /> View in 3D
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="viewer-title"
        onClose={() => setState({ open: false })}
        onClick={(e) => e.target === e.currentTarget && close()}
        className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-2xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/60"
      >
        <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
          <div>
            <h2 id="viewer-title" className="font-semibold">
              {modelName} in 3D
            </h2>
            <p className="text-xs text-muted-foreground">
              A 3D model of this phone model, not this exact phone. See the photos for its
              condition.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close 3D view"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <XIcon className="size-5" aria-hidden />
          </button>
        </div>
        <div className="h-[min(70vh,36rem)]">
          {state.open ? (
            state.webgl ? (
              <Viewer360
                modelUrl={modelUrl}
                label={`3D model of the ${modelName}`}
                reducedMotion={state.reducedMotion}
              />
            ) : (
              <ViewerMessage>
                Your browser can’t show 3D models. The photos show this phone from every side.
              </ViewerMessage>
            )
          ) : null}
        </div>
      </dialog>
    </>
  );
}
