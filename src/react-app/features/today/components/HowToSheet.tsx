import { useState, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Ico } from "@shared/components/icons";
import { BottomSheet } from "@shared/components/BottomSheet";
import { numberToWords } from "@shared/utils/speech";

interface Props {
  content: string;
  onClose: () => void;
  title?: string;
}

function cleanMarkdown(md: string): string {
  return md
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|__|\*|_|`|>|#|~)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandText(text: string): string {
  let expanded = text;
  expanded = expanded.replace(/\b(\d+)\s*(seg|secs?|segundos?)\b/gi, (_, num) => `${numberToWords(Number(num))} segundos`);
  expanded = expanded.replace(/\b(\d+)\s*(min|mins|minutos?)\b/gi, (_, num) => `${numberToWords(Number(num))} minutos`);
  expanded = expanded.replace(/\b(\d+)\s*(reps?|repeticiones?)\b/gi, (_, num) => `${numberToWords(Number(num))} repeticiones`);
  expanded = expanded.replace(/\b(\d+)\s*(kg|kgs|kilos?)\b/gi, (_, num) => `${numberToWords(Number(num))} kilos`);
  expanded = expanded.replace(/\b(\d+)\s*(cm|cms|centímetros)\b/gi, (_, num) => `${numberToWords(Number(num))} centímetros`);
  expanded = expanded.replace(/\b(\d+)\s*(mm|mms|milímetros)\b/gi, (_, num) => `${numberToWords(Number(num))} milímetros`);
  expanded = expanded.replace(/\b\d+\b/g, (m) => numberToWords(Number(m)));
  return expanded;
}

function prepareSpeechText(md: string): string {
  return expandText(cleanMarkdown(md));
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÜÑ])/g).filter((s) => s.trim().length > 0);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedSentence({ sentence, word }: { sentence: string; word: string }) {
  if (!word) return <span>{sentence}</span>;
  const cleanWord = word.replace(/[^\p{L}\p{N}]/gu, "");
  if (!cleanWord) return <span>{sentence}</span>;
  const regex = new RegExp(`(${escapeRegExp(cleanWord)})`, "iu");
  const parts = sentence.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) && part.toLowerCase() === cleanWord.toLowerCase() ? (
          <mark key={i} className="speaking-word">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export function HowToSheet({ content, onClose, title = "CÓMO HACERLO" }: Props) {
  const [speaking, setSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [captionSentence, setCaptionSentence] = useState<string | null>(null);
  const [captionWord, setCaptionWord] = useState("");
  const sentenceIndexRef = useRef(0);
  const sentencesRef = useRef<string[]>([]);

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

  function stopSpeech() {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
    setCaptionSentence(null);
    setCaptionWord("");
  }

  function startSpeech(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    synth.cancel();

    sentencesRef.current = splitSentences(prepareSpeechText(text));
    sentenceIndexRef.current = 0;

    const speakWithVoice = () => {
      const voices = synth.getVoices();
      const esVoice = voices.find((v) => v.lang.toLowerCase().startsWith("es-mx"))
        ?? voices.find((v) => v.lang.toLowerCase().startsWith("es"))
        ?? voices[0];
      speakNext(esVoice);
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

  function speakNext(esVoice: SpeechSynthesisVoice | undefined) {
    const idx = sentenceIndexRef.current;
    const sentences = sentencesRef.current;
    if (idx >= sentences.length) {
      stopSpeech();
      return;
    }

    const sentence = sentences[idx];
    setCaptionSentence(sentence);
    setCaptionWord("");

    const utterance = new SpeechSynthesisUtterance(sentence);
    utterance.lang = "es-MX";
    utterance.rate = 0.92;
    utterance.pitch = 1.12;
    if (esVoice) utterance.voice = esVoice;

    utterance.onboundary = (e) => {
      if (e.name === "word" && e.charLength > 0) {
        const w = sentence.slice(e.charIndex, e.charIndex + e.charLength);
        setCaptionWord(w);
      }
    };

    utterance.onend = () => {
      sentenceIndexRef.current += 1;
      speakNext(esVoice);
    };

    utterance.onerror = () => stopSpeech();

    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.speak(utterance);
    }
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
          {captionSentence && (
            <div className="how-to-caption">
              <HighlightedSentence sentence={captionSentence} word={captionWord} />
            </div>
          )}
          <div className="md-body md-body-dark">
            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}
