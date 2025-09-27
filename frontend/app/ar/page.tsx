"use client";
import { useEffect, useRef } from "react";

const CV = process.env.NEXT_PUBLIC_CV_URL || "http://localhost:8000";

export default function ARPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let running = true;

    async function init() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        tick();
      } catch (err) {
        console.error("camera error", err);
      }
    }

    async function tick() {
      if (!videoRef.current || !running) return;

      const vW = videoRef.current.videoWidth || 640;
      const vH = videoRef.current.videoHeight || 480;

      // Match aspect ratio for the temp frame
      const sendW = 320;
      const sendH = Math.round((sendW * vH) / vW);

      const tmp = document.createElement("canvas");
      tmp.width = sendW;
      tmp.height = sendH;
      const tctx = tmp.getContext("2d")!;
      tctx.drawImage(videoRef.current, 0, 0, sendW, sendH);

      const blob: Blob = await new Promise((resolve) =>
        tmp.toBlob((b) => resolve(b!), "image/jpeg")
      );

      const form = new FormData();
      form.append("file", blob, "frame.jpg");

      try {
        const r = await fetch(`${CV}/recognize`, { method: "POST", body: form });
        let data: any = null;
        const ct = r.headers.get("content-type") || "";
        if (r.ok && ct.includes("application/json")) {
          data = await r.json();
        }

        const canvas = overlayRef.current;
        if (canvas && videoRef.current) {
          canvas.width = vW;
          canvas.height = vH;
          const ctx = canvas.getContext("2d")!;
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (data?.bbox) {
            const [x1, y1, x2, y2] = data.bbox;

            const scaleX = canvas.width / sendW;
            const scaleY = canvas.height / sendH;

            const w = (x2 - x1) * scaleX;
            const h = (y2 - y1) * scaleY;

            // Mirror X since the video is -scale-x-100
            const drawX = canvas.width - (x1 * scaleX + w);
            const drawY = y1 * scaleY;

            ctx.strokeStyle = "#00E8E8";
            ctx.lineWidth = 3;
            ctx.strokeRect(drawX, drawY, w, h);

            const label = `${data.name ?? "Unknown"} (${Number(
              data.confidence || 0
            ).toFixed(2)})`;
            ctx.font = "16px system-ui, sans-serif";
            const pillW = Math.max(180, ctx.measureText(label).width + 16);
            ctx.fillStyle = "rgba(0,128,128,0.9)";
            ctx.fillRect(drawX, Math.max(0, drawY - 28), pillW, 24);
            ctx.fillStyle = "#fff";
            ctx.fillText(label, drawX + 6, Math.max(16, drawY - 10));
          }
        }
      } catch (err) {
        console.error("recognize error", err);
      }
      setTimeout(tick, 400);
    }

    init();
    return () => {
      running = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-black flex items-center justify-center">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover -scale-x-100"
        autoPlay
        playsInline
      />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 w-full h-full"
      />
      <div className="absolute bottom-0 w-full bg-gradient-to-t from-black/60 to-transparent text-white text-center p-4">
        <p className="font-semibold">Looking for a familiar face…</p>
        <p className="text-sm opacity-80">Please step into the frame.</p>
      </div>
    </div>
  );
}
