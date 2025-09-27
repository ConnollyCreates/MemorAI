"use client";

import { useEffect, useRef, useState } from "react";
import * as sdk from "microsoft-cognitiveservices-speech-sdk";
import MemoryCardOverlay from "@/components/MemoryCardOverlay";

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

  // EMA for smoother boxes (per track)
  const smoothBoxes = useRef<
    Map<number, [number, number, number, number]>
  >(new Map());
  const emaBox = (
    tid: number,
    box: [number, number, number, number],
    alpha = 0.35
  ): [number, number, number, number] => {
    const prev = smoothBoxes.current.get(tid);
    if (!prev) {
      smoothBoxes.current.set(tid, box);
      return box;
    }
    const out: [number, number, number, number] = [
      prev[0] + alpha * (box[0] - prev[0]),
      prev[1] + alpha * (box[1] - prev[1]),
      prev[2] + alpha * (box[2] - prev[2]),
      prev[3] + alpha * (box[3] - prev[3]),
    ];
    smoothBoxes.current.set(tid, out);
    return out;
  };

  // latest-wins request gating
  const reqCounter = useRef(0);
  const lastHandledReq = useRef(0);

  // cooldowns for TTS + name change tracking
  const lastSpeakAt = useRef(0);
  const lastNameShown = useRef<string>("Unknown");

  // snap-side card + throttled Y nudge
  const cardSideRef = useRef<"left" | "right">("right");
  const cardElRef = useRef<HTMLDivElement | null>(null);
  const lastCardYUpdate = useRef(0);
  // New: flip cooldown to avoid rapid toggling
  const lastFlipAtRef = useRef(0);

  // tuning knobs
  const ACCEPT_CONF = 0.62; // show immediately when >= this confidence
  const HOLD_MS = 500; // keep last name briefly when it flickers to Unknown
  const MAJ_WIN = 2; // 2-frame majority for quick lock

  const [status, setStatus] = useState("boot");
  const lastStatusRef = useRef(status);
  const safeSetStatus = (s: string) => {
    if (lastStatusRef.current !== s) {
      lastStatusRef.current = s;
      setStatus(s);
    }
  };

  const [currentName, setCurrentName] = useState("Unknown");
  const [confidence, setConfidence] = useState(0);

  // Memory card bits
  const [caption, setCaption] = useState("");
  const [relationship, setRelationship] = useState<string>("");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>(undefined);
  const [photosCount, setPhotosCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    let running = true;
    let stream: MediaStream | null = null;

    const init = async () => {
      try {
        safeSetStatus("requesting-camera");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!running) return;

        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();
        safeSetStatus("camera-on");
        loop();
      } catch (e) {
        console.error("camera error", e);
        safeSetStatus("camera-error");
      }
    };

    const loop = async () => {
      if (!running || !videoRef.current) return;

      const video = videoRef.current;
      const vW = video.videoWidth || 640;
      const vH = video.videoHeight || 480;

      // keep aspect ratio for the downscaled frame (a touch smaller for perf)
      const sendW = 288;
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
        sendCanvas.toBlob((b) => res(b!), "image/jpeg", 0.4) // smaller + faster
      );

      const form = new FormData();
      form.append("image", blob, "frame.jpg");

      // id this request; latest-wins
      const myReqId = ++reqCounter.current;

      try {
        const r = await fetch(`${CV}/recognize`, { method: "POST", body: form });
        if (!r.ok) {
          if (myReqId > lastHandledReq.current) {
            safeSetStatus(`cv-http-${r.status}`);
            lastHandledReq.current = myReqId;
          }
          scheduleNext();
          return;
        }
        const ct = r.headers.get("content-type") || "";
        if (!ct.includes("application/json")) {
          if (myReqId > lastHandledReq.current) {
            safeSetStatus("cv-nonjson");
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
            smoothBoxes.current.delete(tid);
          }
        }

        // draw all boxes (scale -> mirror -> EMA -> draw)
        for (const d of dets) {
          let b = scaleBBox(
            d.bbox,
            canvas.width,
            canvas.height,
            sendW,
            sendH
          );
          b = mirrorBBox(b, canvas.width);
          b = emaBox(d.track_id, b); // smoothing
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

        // choose best non-Unknown for card/TTS
        const best = dets
          .filter((d) => d.name !== "Unknown")
          .sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0))[0];

        const speakCooldownMs = 1200;

        // Avoid covering face: flip or nudge card when too close/overlapping
        if (best) {
          let bb = scaleBBox(best.bbox, canvas.width, canvas.height, sendW, sendH);
          bb = mirrorBBox(bb, canvas.width);
          const [bx, by, bw, bh] = bb;

          const CARD_W = cardElRef.current?.offsetWidth ?? 320;
          const CARD_H = cardElRef.current?.offsetHeight ?? 260;
          const PAD = 8; // screen edge padding
          const SAFE_GAP = 16; // desired gap between face and card
          const FLIP_COOLDOWN = 700; // ms

          // current card rect based on side and its current top style
          const side = cardSideRef.current;
          const topNow = (() => {
            const y = parseFloat(cardElRef.current?.style.top || "0");
            if (!isFinite(y)) return Math.max(PAD, Math.min(by + bh / 2 - CARD_H / 2, canvas.height - CARD_H - PAD));
            return y;
          })();
          const leftNow = side === "left" ? PAD : canvas.width - CARD_W - PAD;
          const cardRect = { x: leftNow, y: topNow, w: CARD_W, h: CARD_H };
          const faceRect = { x: bx, y: by, w: bw, h: bh };

          const intersects = !(
            cardRect.x + cardRect.w < faceRect.x - SAFE_GAP ||
            faceRect.x + faceRect.w < cardRect.x - SAFE_GAP ||
            cardRect.y + cardRect.h < faceRect.y - SAFE_GAP ||
            faceRect.y + faceRect.h < cardRect.y - SAFE_GAP
          );

          // If overlapping/too close, prefer flipping sides if cooldown passed
          if (intersects && nowMs - lastFlipAtRef.current > FLIP_COOLDOWN) {
            cardSideRef.current = side === "left" ? "right" : "left";
            lastFlipAtRef.current = nowMs;
          }

          // After possible flip, recompute left and small vertical nudge to keep away
          const newSide = cardSideRef.current;
          const newLeft = newSide === "left" ? PAD : canvas.width - CARD_W - PAD;

          // Nudge top to above or below the face if still too close vertically
          const needVerticalNudge =
            !(cardRect.y + cardRect.h < faceRect.y - SAFE_GAP || faceRect.y + faceRect.h < cardRect.y - SAFE_GAP);

          let targetTop = topNow;
          if (needVerticalNudge) {
            // place just above or below depending on space
            const aboveTop = Math.max(PAD, faceRect.y - CARD_H - SAFE_GAP);
            const belowTop = Math.min(canvas.height - CARD_H - PAD, faceRect.y + faceRect.h + SAFE_GAP);
            // choose the side with more space
            const spaceAbove = faceRect.y - PAD;
            const spaceBelow = canvas.height - (faceRect.y + faceRect.h) - PAD;
            targetTop = spaceAbove >= spaceBelow ? aboveTop : belowTop;
          }

          // Apply DOM writes under throttle
          if (cardElRef.current) {
            // update left immediately if side changed
            cardElRef.current.style.left = newSide === "left" ? `${PAD}px` : "";
            cardElRef.current.style.right = newSide === "right" ? `${PAD}px` : "";

            if (nowMs - lastCardYUpdate.current > 90) {
              const clampedTop = Math.max(PAD, Math.min(targetTop, canvas.height - CARD_H - PAD));
              cardElRef.current.style.top = `${clampedTop}px`;
              lastCardYUpdate.current = nowMs;
            }
          }
        }

        // existing snap side when person changes remains as a fallback
        if (best) {
          let bb = scaleBBox(best.bbox, canvas.width, canvas.height, sendW, sendH);
          bb = mirrorBBox(bb, canvas.width);
          const [bx, , bw] = bb;
          const faceCenterX = bx + bw / 2;
          if (best.name !== lastNameShown.current) {
            cardSideRef.current = faceCenterX < canvas.width / 2 ? "right" : "left";
            // also update styles immediately
            if (cardElRef.current) {
              const PAD = 8;
              cardElRef.current.style.left = cardSideRef.current === "left" ? `${PAD}px` : "";
              cardElRef.current.style.right = cardSideRef.current === "right" ? `${PAD}px` : "";
            }
          }
        }

        if (best && best.name !== lastNameShown.current) {
          lastNameShown.current = best.name;
          safeSetStatus("recognized");
          setCurrentName(best.name);
          setConfidence(best.conf ?? 0);

          try {
            const q = await fetch(
              `${API}/memories?personId=${encodeURIComponent(best.name)}`
            );
            if (q.ok) {
              const j = await q.json();
              const item = j?.item || j || {};

              const cap =
                item.caption || `A favorite memory with ${best.name}.`;
              const rel = item.relationship || "";
              const urls: string[] =
                item.photoUrls ||
                item.photos ||
                (item.photoUrl ? [item.photoUrl] : []) ||
                [];

              setCaption(cap);
              setRelationship(rel);
              setPhotoUrl(urls[0]);
              setPhotosCount(urls.length);

              if (nowMs - lastSpeakAt.current > speakCooldownMs) {
                lastSpeakAt.current = nowMs;
                speak(`This is ${best.name}. ${cap}`);
              }
            } else {
              setCaption("");
              setRelationship("");
              setPhotoUrl(undefined);
              setPhotosCount(undefined);
            }
          } catch {
            setCaption("");
            setRelationship("");
            setPhotoUrl(undefined);
            setPhotosCount(undefined);
          }
        } else if (!best && lastNameShown.current !== "Unknown") {
          lastNameShown.current = "Unknown";
          setCurrentName("Unknown");
          setCaption("");
          setRelationship("");
          setPhotoUrl(undefined);
          setPhotosCount(undefined);
          safeSetStatus("searching");
        } else if (!best) {
          safeSetStatus("searching");
        }
      } catch (err) {
        console.error("recognize network/CORS error", err);
        safeSetStatus("cv-unreachable");
      }

      scheduleNext();
    };

    const scheduleNext = () => {
      // ~8 fps perceived; EMA + fixed card makes it feel smooth
      setTimeout(() => running && loop(), 125);
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

      {/* memory card: fixed to snapped side, Y nudged via style (no re-render) */}
      {currentName !== "Unknown" && (
        <div
          ref={cardElRef}
          className="absolute z-20"
          style={{ top: "calc(50% - 130px)", right: "16px" }} // initial on right side
        >
          <MemoryCardOverlay
            name={currentName}
            relationship={relationship || "Loved One"}
            caption={caption}
            photoUrl={photoUrl}
            photosCount={photosCount}
            active
          />
        </div>
      )}

      {/* tiny status pill (debug) */}
      <div className="absolute top-3 right-3 z-20">
        <div className="text-[11px] px-2 py-1 rounded-md bg-black/50 text-white/90">
          {status.replaceAll("-", " ")}
          {currentName !== "Unknown" ? ` • ${confidence.toFixed(2)}` : ""}
        </div>
      </div>
    </div>
  );
}
