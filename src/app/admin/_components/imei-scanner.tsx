"use client";

import { ScanLineIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { isValidImei } from "@/lib/validation/uk";

const noopSubscribe = () => () => {};

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

/**
 * Scans an IMEI barcode with the camera, where the browser supports it
 * (BarcodeDetector: Chrome and Edge on Android, ChromeOS, macOS). Without
 * it, the button isn't shown and staff type the IMEI (dial *#06#).
 */
export function ImeiScanner({ onScan }: { onScan: (imei: string) => void }) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia),
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("Point the camera at the IMEI barcode.");
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let stopped = false;
    const Ctor = (window as unknown as { BarcodeDetector: DetectorConstructor }).BarcodeDetector;
    const detector = new Ctor({
      formats: ["code_128", "code_39", "ean_13", "qr_code", "data_matrix"],
    });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (s) => {
        stream = s;
        if (stopped || !video.current) return;
        video.current.srcObject = s;
        await video.current.play();
        const scan = async () => {
          if (stopped || !video.current) return;
          const codes = await detector.detect(video.current).catch(() => []);
          const imei = codes
            .map((c) => c.rawValue.replace(/\D/g, ""))
            .find((v) => v.length === 15 && isValidImei(v));
          if (imei) {
            onScan(imei);
            setOpen(false);
            return;
          }
          timer = window.setTimeout(scan, 250);
        };
        void scan();
      })
      .catch(() => setMessage("Camera not available. Type the IMEI instead."));
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onScan]);

  if (!supported) return null;
  return (
    <>
      <Button type="button" variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
        <ScanLineIcon aria-hidden /> Scan
      </Button>
      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Scan IMEI barcode"
          className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
        >
          <div className="flex items-center justify-between text-white">
            <p role="status">{message}</p>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              aria-label="Close scanner"
              onClick={() => setOpen(false)}
              autoFocus
            >
              <XIcon aria-hidden />
            </Button>
          </div>
          <video
            ref={video}
            className="mt-4 w-full flex-1 rounded-lg object-cover"
            muted
            playsInline
          />
        </div>
      ) : null}
    </>
  );
}
