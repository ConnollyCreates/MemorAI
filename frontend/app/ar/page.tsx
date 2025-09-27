"use client";

import { useEffect, useRef, useState } from "react";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";

/** ---------- env & defaults ---------- */
const CV = process.env.NEXT_PUBLIC_CV_URL || "http://127.0.0.1:8000";
const API = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:4000";
const AZURE_KEY = process.env.NEXT_PUBLIC_AZURE_SPEECH_KEY;
const AZURE_REGION = process.env.NEXT_PUBLIC_AZURE_SPEECH_REGION;

/** ---------- types & helpers ---------- */
type Detection = {
  track_id: number;
  bbox: [number, number, number, number]; // [x,y,w,h] in SEND space
  name: string;
  conf: number;
};

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

// scale (sendW/sendH -> canvas W/H)
function scaleBBox(
  [x, y, w, h]: number[],
  W: number,
  H: number,
  sendW: number,
  sendH: number
): [number, number, number, number] {
  const sx = W / sendW,
    sy = H / sendH;
  return [x * sx, y * sy, w * sx, h * sy];
}

// mirror X once because <video> is -scale-x-100
function mirrorBBox(
  [x, y, w, h]: number[],
  W: number
): [number, number, number, number] {
  const xMir = W - (x + w);
  return [xMir, y, w, h];
}

/** ---------- page ---------- */
export default function ARPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  // offscreen canvas reused for downscaled JPEGs
  const sendCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // history + state per track for fast, stable labels
  const trackHistory = useRef<Map<number, string[]>>(new Map());
  const trackState = useRef<
    Map<number, { name: string; conf: number; lastSeen: number }>
  >(new Map());

  // latest-wins request gating
  const reqCounter = useRef(0);
  const lastHandledReq = useRef(0);

  // cooldowns for TTS
  const lastSpeakAt = useRef(0);
  const lastNameShown = useRef<string>("Unknown");

  // tuning knobs
  const ACCEPT_CONF = 0.62; // show immediately when >= this confidence
  const HOLD_MS = 500; // keep last name briefly when it flickers to Unknown
  const MAJ_WIN = 2; // 2-frame majority for quick lock

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
        loop();
      } catch (e) {
        console.error("camera error", e);
        setStatus("camera-error");
      }
    };

    const loop = async () => {
      if (!running || !videoRef.current) return;

      const video = videoRef.current;
      const vW = video.videoWidth || 640;
      const vH = video.videoHeight || 480;

      // keep aspect ratio for the downscaled frame
      const sendW = 320;
      const sendH = Math.round((sendW * vH) / vW);

      // prepare reusable offscreen canvas
      if (!sendCanvasRef.current) {
        sendCanvasRef.current = document.createElement("canvas");
      }
      const sendCanvas = sendCanvasRef.current;
      if (sendCanvas.width !== sendW || sendCanvas.height !== sendH) {
        sendCanvas.width = sendW;
        sendCanvas.height = sendH;
      }
      const sctx = sendCanvas.getContext("2d")!;
      sctx.drawImage(video, 0, 0, sendW, sendH);

      const blob: Blob = await new Promise((res) =>
        sendCanvas.toBlob((b) => res(b!), "image/jpeg", 0.45) // lighter + faster
      );

      const form = new FormData();
      form.append("image", blob, "frame.jpg");

      // id this request; latest-wins
      const myReqId = ++reqCounter.current;

      try {
        const r = await fetch(`${CV}/recognize`, { method: "POST", body: form });
        if (!r.ok) {
          if (myReqId > lastHandledReq.current) {
            setStatus(`cv-http-${r.status}`);
            lastHandledReq.current = myReqId;
          }
          scheduleNext();
          return;
        }
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          if (myReqId > lastHandledReq.current) {
            setStatus("cv-nonjson");
            lastHandledReq.current = myReqId;
          }
          scheduleNext();
          return;
        }

        // ignore stale responses
        if (myReqId <= lastHandledReq.current) {
          scheduleNext();
          return;
        }
        lastHandledReq.current = myReqId;

        const data: { detections?: Detection[] } = await r.json();
        const dets = Array.isArray(data?.detections) ? data.detections : [];

        // prep overlay canvas (resize only when needed)
        const canvas = overlayRef.current!;
        if (canvas.width !== vW || canvas.height !== vH) {
          canvas.width = vW;
          canvas.height = vH;
        }
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // --- Fast stabilization: early-accept + hysteresis ---
        const nowMs = performance.now();

        for (const d of dets) {
          // maintain short history
          const hist = trackHistory.current.get(d.track_id) ?? [];
          hist.push(d.name);
          if (hist.length > MAJ_WIN) hist.shift();
          trackHistory.current.set(d.track_id, hist);

          // majority over 2 frames
          const maj = hist.sort(
            (a, b) =>
              hist.filter((x) => x === b).length -
              hist.filter((x) => x === a).length
          )[0];

          const prev = trackState.current.get(d.track_id);

          // early accept if confident; else use short majority
          let show = (d.conf ?? 0) >= ACCEPT_CONF ? d.name : maj;

          // hysteresis: brief Unknown → keep prior name
          if (
            show === "Unknown" &&
            prev &&
            prev.name !== "Unknown" &&
            nowMs - prev.lastSeen < HOLD_MS
          ) {
            show = prev.name;
          }

          d.name = show;
          trackState.current.set(d.track_id, {
            name: d.name,
            conf: d.conf ?? 0,
            lastSeen: nowMs,
          });
        }

        // prune stale tracks (housekeeping)
        for (const [tid, st] of trackState.current) {
          if (nowMs - st.lastSeen > 2000) {
            trackState.current.delete(tid);
            trackHistory.current.delete(tid);
          }
        }

        // draw all boxes (scale -> mirror -> draw)
        for (const d of dets) {
          let b = scaleBBox(
            d.bbox,
            canvas.width,
            canvas.height,
            sendW,
            sendH
          );
          b = mirrorBBox(b, canvas.width);
          const [dx, dy, dw, dh] = b;

          ctx.strokeStyle = "cyan";
          ctx.lineWidth = 3;
          ctx.strokeRect(dx, dy, dw, dh);

          const label = `${d.name} (${(d.conf ?? 0).toFixed(2)})`;
          ctx.font = "16px system-ui, sans-serif";
          const pillW = Math.max(180, ctx.measureText(label).width + 16);
          ctx.fillStyle = "rgba(0,128,128,0.9)";
          ctx.fillRect(dx, Math.max(0, dy - 28), pillW, 24);
          ctx.fillStyle = "#fff";
          ctx.fillText(label, dx + 6, Math.max(16, dy - 10));
        }

        // choose best non-Unknown for card/TTS (don’t debounce UI; debounce voice)
        const best = dets
          .filter((d) => d.name !== "Unknown")
          .sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0))[0];

        const speakCooldownMs = 1200;

        if (best && best.name !== lastNameShown.current) {
          lastNameShown.current = best.name;
          setStatus("recognized");
          setCurrentName(best.name);
          setConfidence(best.conf ?? 0);

          try {
            const q = await fetch(
              `${API}/memories?personId=${encodeURIComponent(best.name)}`
            );
            if (q.ok) {
              const j = await q.json();
              const cap =
                j?.item?.caption || `A favorite memory with ${best.name}.`;
              setCaption(cap);
              if (nowMs - lastSpeakAt.current > speakCooldownMs) {
                lastSpeakAt.current = nowMs;
                speak(`This is ${best.name}. ${cap}`);
              }
            } else {
              setCaption("");
            }
          } catch {
            setCaption("");
          }
        } else if (!best && lastNameShown.current !== "Unknown") {
          lastNameShown.current = "Unknown";
          setCurrentName("Unknown");
          setCaption("");
          setStatus("searching");
        } else if (!best) {
          setStatus("searching");
        }
      } catch (err) {
        console.error("recognize network/CORS error", err);
        setStatus("cv-unreachable");
      }

      scheduleNext();
    };

    const scheduleNext = () => {
      // ~9 fps perceived; tweak 100–130ms to taste
      setTimeout(() => running && loop(), 110);
    };

    init();
    return () => {
      running = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
      {/* overlay canvas (transparent, not mirrored) */}
      <canvas
        ref={overlayRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* status + memory card */}
      <div className="absolute bottom-0 w-full bg-white/90 backdrop-blur p-4">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">
            {currentName !== "Unknown"
              ? `This is ${currentName}`
              : "Looking for a familiar face…"}
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
