import { useState, useEffect } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Ico } from "./icons";
import { BottomSheet } from "./BottomSheet";

interface Props {
  content: string;
  onClose: () => void;
  title?: string;
}

function stripMarkdown(md: string): string {
  return md
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__|\*|_|`|>|#|~|\-)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function HowToSheet({ content, onClose, title = "CÓMO HACERLO" }: Props) {
  const [speaking, setSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => {
    setSpeechSupported(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function startSpeech(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    synth.cancel();

    const speakWithVoice = () => {
      const voices = synth.getVoices();
      const esVoice = voices.find((v) => v.lang.toLowerCase().startsWith("es-mx"))
        ?? voices.find((v) => v.lang.toLowerCase().startsWith("es"))
        ?? voices[0];
      const utterance = new SpeechSynthesisUtterance(stripMarkdown(text));
      utterance.lang = "es-MX";
      utterance.rate = 1;
      if (esVoice) utterance.voice = esVoice;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      synth.speak(utterance);
      setSpeaking(true);
    };

    const voices = synth.getVoices();
    if (voices.length === 0 && "onvoiceschanged" in synth) {
      const handler = () => {
        speakWithVoice();
        synth.onvoiceschanged = null;
      };
      synth.onvoiceschanged = handler;
      window.setTimeout(() => {
        if (synth.getVoices().length > 0) {
          synth.onvoiceschanged = null;
          speakWithVoice();
        }
      }, 300);
      return;
    }
    speakWithVoice();
  }

  function stopSpeech() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }

  return (
    <BottomSheet variant="dark" size="default" onClose={onClose}>
      <div style={{
        display: "flex", flexDirection: "column", height: "100%", overflow: "hidden",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", flexShrink: 0,
        }}>
          <span style={{
            fontSize: 11, fontFamily: "var(--font-mono)", letterSpacing: "0.12em",
            color: "rgba(245,240,232,0.55)",
          }}>
            {title}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {speechSupported && (
              <button
                onClick={() => (speaking ? stopSpeech() : startSpeech(content))}
                aria-label={speaking ? "Detener lectura" : "Escuchar instrucciones"}
                aria-pressed={speaking}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 4,
                  display: "flex", alignItems: "center",
                }}
              >
                {speaking
                  ? <Ico.stop s={20} c="rgba(245,240,232,0.70)" />
                  : <Ico.speaker s={20} c="rgba(245,240,232,0.70)" />}
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Cerrar"
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 4,
                display: "flex", alignItems: "center",
              }}
            >
              <Ico.close s={20} c="rgba(245,240,232,0.70)" />
            </button>
          </div>
        </div>
        <div style={{
          flex: 1, minHeight: 0, overflowY: "auto", padding: "0 20px 24px",
        }}>
          <div className="md-body md-body-dark">
            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
