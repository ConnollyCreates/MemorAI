"use client";

import { useEffect, useRef, useState } from "react";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";

/** ---------- env & defaults ---------- */
const CV = process.env.NEXT_PUBLIC_CV_URL || "http://127.0.0.1:8000";
const API = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:4000";
const AZURE_KEY = process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION;

/** ---------- helpers ---------- */
function speak(text: string) {
  if (AZURE_KEY && AZURE_REGION) {
    const cfg = sdk.SpeechConfig.fromSubscription(AZURE_KEY, AZURE_REGION);
    cfg.speechSynthesisVoiceName = "en-US-JennyNeural";
    const audio = sdk.AudioConfig.fromDefaultSpeakerOutput();
    const synth = new sdk.SpeechSynthesizer(cfg, audio);
    synth.speakTextAsync(
      text,
      () => synth.close(),
      (e) => {
        console.error("Azure TTS error", e);
        synth.close();
      }
    );
  } else if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
}

function majorityStable(values: string[], n = 3) {
  if (values.length < n) return null;
  const recent = values.slice(-n);
  return recent.every((v) => v === recent[0]) ? recent[0] : null;
}

/** ---------- page ---------- */
export default function ARPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const nameHistory = useRef<string[]>([]);

  const [status, setStatus] = useState("boot");
  const [currentName, setCurrentName] = useState("Unknown");
  const [confidence, setConfidence] = useState(0);
  const [caption, setCaption] = useState("");

  useEffect(() => {
    let running = true;
    let stream: MediaStream | null = null;

    const init = async () => {
      try {
        setStatus("requesting-camera");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!running) return;

        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        setStatus("camera-on");
        tick();
      } catch (e) {
        console.error("camera error", e);
        setStatus("camera-error");
      }
    };

    const tick = async () => {
      if (!running || !videoRef.current) return;

      const video = videoRef.current;
      const vW = video.videoWidth || 640;
      const vH = video.videoHeight || 480;

      // keep aspect ratio for the downscaled frame
      const sendW = 320;
      const sendH = Math.round((sendW * vH) / vW);

      // make small frame to send
      const tmp = document.createElement("canvas");
      tmp.width = sendW;
      tmp.height = sendH;
      const tctx = tmp.getContext("2d")!;
      tctx.drawImage(video, 0, 0, sendW, sendH);
      const blob: Blob = await new Promise((res) =>
        tmp.toBlob((b) => res(b!), "image/jpeg", 0.85)
      );

      const form = new FormData();
      form.append("image", blob, "frame.jpg"); // MUST match FastAPI param name

      try {
        const r = await fetch(`${CV}/recognize`, { method: "POST", body: form });
        if (!r.ok) {
          setStatus(`cv-http-${r.status}`);
          setTimeout(tick, 300);
          return;
        }
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          setStatus("cv-nonjson");
          setTimeout(tick, 300);
          return;
        }
        const data = await r.json();

        // ----- draw overlay (scale + mirror aware) -----
        const canvas = overlayRef.current!;
        canvas.width = vW;
        canvas.height = vH;
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (data?.bbox) {
          const [x1, y1, x2, y2] = data.bbox as [number, number, number, number];

          // scale from sendW x sendH to canvas size
          const scaleX = canvas.width / sendW;
          const scaleY = canvas.height / sendH;

          const w = (x2 - x1) * scaleX;
          const h = (y2 - y1) * scaleY;

          // video is mirrored (-scale-x-100). Canvas is not.
          // So mirror X in code:
          const drawX = canvas.width - (x1 * scaleX + w);
          const drawY = y1 * scaleY;

          ctx.strokeStyle = "cyan";
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

        // ----- smoothing + memory fetch -----
        const name = data?.name || "Unknown";
        const conf = Number(data?.confidence || 0);
        nameHistory.current.push(name);
        if (nameHistory.current.length > 6) nameHistory.current.shift();

        const stable = majorityStable(nameHistory.current, 3);
        if (stable && stable !== currentName && stable !== "Unknown") {
          setCurrentName(stable);
          setConfidence(conf);
          setStatus("recognized");
          try {
            const q = await fetch(`${API}/memories?personId=${encodeURIComponent(stable)}`);
            if (q.ok) {
              const j = await q.json();
              const cap = j?.item?.caption || `A favorite memory with ${stable}.`;
              setCaption(cap);
              speak(`This is ${stable}. ${cap}`);
            } else {
              setCaption("");
            }
          } catch {
            setCaption("");
          }
        } else if (stable === "Unknown" && currentName !== "Unknown") {
          setCurrentName("Unknown");
          setCaption("");
          setStatus("searching");
        } else if (!stable) {
          setStatus("searching");
        }
      } catch (err) {
        console.error("recognize network/CORS error", err);
        setStatus("cv-unreachable");
      }

      setTimeout(tick, 250); // ~4 fps
    };

    init();
    return () => {
      running = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [currentName]);

  return (
    <div className="relative w-full h-screen bg-black">
      {/* mirrored video */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover -scale-x-100"
        muted
        playsInline
        autoPlay
      />
      {/* overlay canvas (not mirrored) */}
      <canvas ref={overlayRef} className="absolute inset-0 w-full h-full" />

      {/* status + memory card */}
      <div className="absolute bottom-0 w-full bg-white/90 backdrop-blur p-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">
            {currentName !== "Unknown" ? `This is ${currentName}` : "Looking for a familiar face…"}
          </div>
          <div className="text-xs text-gray-500">
            {status.replaceAll("-", " ")}
            {currentName !== "Unknown" ? ` • conf ${confidence.toFixed(2)}` : ""}
          </div>
        </div>
        <div className="text-sm text-gray-700">
          {currentName !== "Unknown" ? caption : "Please step into the frame."}
        </div>
      </div>
    </div>
  );
}
