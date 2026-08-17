import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useReducer } from "spacetimedb/react";
import { motion, AnimatePresence } from "framer-motion";
import { reducers } from "../module_bindings";
import { processIncidentWithAI, formatIncidentDescription } from "../lib/ai";
import SOSButton from "./SOSButton";

interface IncidentReporterProps {
  forcedLat?: number;
  forcedLng?: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

const IncidentReporter = ({
  forcedLat,
  forcedLng,
  onSuccess,
  onCancel,
}: IncidentReporterProps = {}) => {
  const [incidentText, setIncidentText] = useState("");
  const [currentLat, setCurrentLat] = useState(21.1458);
  const [currentLng, setCurrentLng] = useState(79.0882);
  const [isSending, setIsSending] = useState(false);
  const [isAudioRecording, setIsAudioRecording] = useState(false);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioRecorder, setAudioRecorder] = useState<MediaRecorder | null>(
    null,
  );
  const goToRoute = useNavigate();

  const dispatchIncident = useReducer(reducers.createIncident);

  useEffect(() => {
    let recordingTimer: any;
    if (isAudioRecording && !isAudioPaused) {
      recordingTimer = setInterval(() => {
        setAudioDuration((prevSeconds) => prevSeconds + 1);
      }, 1000);
    }
    return () => clearInterval(recordingTimer);
  }, [isAudioRecording, isAudioPaused]);

  useEffect(() => {
    if (forcedLat !== undefined && forcedLng !== undefined) {
      setCurrentLat(forcedLat);
      setCurrentLng(forcedLng);
      return;
    }
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((geoPos) => {
        setCurrentLat(geoPos.coords.latitude);
        setCurrentLng(geoPos.coords.longitude);
      });
    }
  }, [forcedLat, forcedLng]);

  const submitReport = async (altDescription?: string, voiceData?: Blob) => {
    const finalText = altDescription || incidentText;
    if (!finalText.trim() && !voiceData) return;

    setIsSending(true);
    setIsAnalyzing(true);

    try {
      let voicePayload: any = undefined;
      if (voiceData) {
        const fileReader = new FileReader();
        const encodedAudioPromise = new Promise<string>((resolvePromise) => {
          fileReader.onloadend = () => {
            const encodedString = (fileReader.result as string).split(",")[1];
            resolvePromise(encodedString);
          };
        });
        fileReader.readAsDataURL(voiceData);
        const finalEncodedAudio = await encodedAudioPromise;
        voicePayload = {
          data: finalEncodedAudio,
          mimeType: voiceData.type || "audio/webm",
        };
      }

      const processedAI = await processIncidentWithAI(
        finalText.trim(),
        voicePayload,
      );
      const formattedText = formatIncidentDescription(processedAI);

      await dispatchIncident({
        category: processedAI.category.toLowerCase(),
        description: formattedText,
        lat: currentLat,
        lng: currentLng,
      });

      fetch("https://rescuevultr.amyverse.in/api/broadcast-safety", {
        method: "POST",
      });

      setIncidentText("");
      setIsAudioRecording(false);
      setAudioDuration(0);

      if (onSuccess) {
        onSuccess();
      } else {
        goToRoute("/success");
      }
    } catch (reportError) {
      console.error("Failed to report incident:", reportError);
    } finally {
      setIsSending(false);
      setIsAnalyzing(false);
    }
  };

  const switchRecordingState = async () => {
    if (!isAudioRecording) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        const newRecorder = new MediaRecorder(micStream);
        const audioChunks: Blob[] = [];

        newRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunks.push(event.data);
        };

        newRecorder.onstop = () => {
          const finalAudioBlob = new Blob(audioChunks, { type: "audio/webm" });
          submitReport("Audio transcription...", finalAudioBlob);
          micStream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
        };

        newRecorder.start();
        setAudioRecorder(newRecorder);
        setIsAudioRecording(true);
        setIsAudioPaused(false);
        setAudioDuration(0);
      } catch (micError) {
        alert("Microphone access is required for voice reporting.");
      }
    } else {
      if (audioRecorder && audioRecorder.state === "recording") {
        audioRecorder.stop();
      }
    }
  };

  const abortRecording = () => {
    if (audioRecorder) {
      audioRecorder.stop();
      audioRecorder.onstop = () => {}; // Prevent triggering submission
    }
    setIsAudioRecording(false);
    setAudioDuration(0);
  };

  return (
    <div className="w-full flex flex-col gap-2 relative">
      <div className="flex justify-between items-end mb-1">
        <div>
          {onCancel && (
            <button
              onClick={onCancel}
              className="text-white/50 hover:text-white font-bold text-[10px] md:text-[11px] uppercase tracking-widest cursor-pointer"
            >
              Cancel
            </button>
          )}
        </div>
        <div className="w-20 md:w-24 h-10 md:h-12 md:hidden">
          <SOSButton isFixed={false} className="border-2" />
        </div>
      </div>

      <div className="bg-white p-1 md:p-2 flex items-center gap-2 border border-espresso/20 rounded-sm relative shadow-sm">
        <AnimatePresence mode="wait">
          {!isAudioRecording ? (
            <motion.div
              key="text-input"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="flex-1 flex items-end gap-2"
            >
              <textarea
                placeholder="Describe the incident..."
                value={incidentText}
                onChange={(eventObj) => {
                  setIncidentText(eventObj.target.value);
                  eventObj.target.style.height = "auto";
                  eventObj.target.style.height = `${eventObj.target.scrollHeight}px`;
                }}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key === "Enter" && !keyEvent.shiftKey) {
                    keyEvent.preventDefault();
                    submitReport();
                  }
                }}
                rows={1}
                disabled={isSending}
                className="flex-1 bg-surface p-3 md:p-4 text-[14px] md:text-[15px] outline-none disabled:opacity-50 rounded-xs resize-none overflow-y-hidden min-h-[44px] md:min-h-[50px] leading-relaxed transition-all duration-200"
                style={{ height: "auto" }}
              />
              <button
                type="button"
                onClick={switchRecordingState}
                disabled={isSending}
                className="w-[44px] h-[44px] md:w-[50px] md:h-[50px] bg-surface flex items-center justify-center shrink-0 transition-colors hover:bg-espresso/5 cursor-pointer text-espresso rounded-sm border border-espresso/10 selection:bg-espresso/20"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  width="18"
                  height="18"
                >
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="recorder-active"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="flex-1 bg-terracotta/5 p-3 md:p-4 flex items-center justify-between rounded-sm"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full bg-terracotta ${isAudioPaused ? "" : "animate-pulse"}`}
                />
                <span className="font-black text-[12px] md:text-[14px] text-espresso uppercase tracking-widest">
                  {isAudioPaused ? "Paused" : `${audioDuration}s`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAudioPaused(!isAudioPaused)}
                  className="px-3 py-1 bg-espresso/5 hover:bg-espresso/10 text-[10px] font-black uppercase cursor-pointer rounded-xs border border-espresso/10"
                >
                  {isAudioPaused ? "Resume" : "Pause"}
                </button>
                <button
                  onClick={abortRecording}
                  className="px-3 py-1 bg-espresso/5 hover:bg-espresso/10 text-[10px] font-black uppercase cursor-pointer text-terracotta rounded-xs border border-espresso/10"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        onClick={() => {
          if (isAudioRecording) {
            if (audioRecorder && audioRecorder.state === "recording") {
              audioRecorder.stop();
            }
          } else {
            submitReport();
          }
        }}
        disabled={isSending || (!incidentText.trim() && !isAudioRecording)}
        className="bg-terracotta text-white py-4 md:py-5 font-black text-[12px] md:text-[14px] tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-transform disabled:cursor-not-allowed cursor-pointer rounded-sm border border-espresso/20 shadow-lg"
      >
        {isSending
          ? isAnalyzing
            ? "ANALYZING..."
            : "REPORTING..."
          : isAudioRecording
            ? "FINISH & UPLOAD"
            : "REPORT INCIDENT"}
      </button>
    </div>
  );
};

export default IncidentReporter;
