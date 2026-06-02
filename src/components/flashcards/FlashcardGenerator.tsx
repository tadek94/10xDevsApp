import React, { useState } from "react";
import { Loader2, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CardReviewItem } from "@/components/flashcards/CardReviewItem";

interface SuggestionCard {
  id: string;
  front: string;
  back: string;
  accepted: boolean;
  editing: boolean;
  editFront: string;
  editBack: string;
}

interface GenerateResponse {
  cards?: { front: string; back: string }[];
  error?: string;
}

interface SaveResponse {
  saved?: number;
  error?: string;
}

export function FlashcardGenerator() {
  const [text, setText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionCard[]>([]);

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const charCount = text.length;
  const canGenerate = wordCount >= 50 && !isGenerating && !isSaving;
  const acceptedCount = suggestions.filter((c) => c.accepted).length;
  const canSave = acceptedCount > 0 && !isSaving && !isGenerating;

  async function handleGenerate() {
    setError(null);
    setSuccess(null);
    setIsGenerating(true);
    try {
      const res = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.status === 401) {
        window.location.href = "/auth/signin";
        return;
      }
      const data: GenerateResponse = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Wystąpił błąd podczas generowania.");
        return;
      }
      setSuggestions(
        (data.cards ?? []).map((c) => ({
          id: crypto.randomUUID(),
          front: c.front,
          back: c.back,
          accepted: true,
          editing: false,
          editFront: c.front,
          editBack: c.back,
        })),
      );
    } catch {
      setError("Nie można połączyć się z serwerem.");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave() {
    setError(null);
    setIsSaving(true);
    try {
      const accepted = suggestions.filter((c) => c.accepted).map((c) => ({ front: c.front, back: c.back }));
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: accepted }),
      });
      if (res.status === 401) {
        window.location.href = "/auth/signin";
        return;
      }
      const data: SaveResponse = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Nie udało się zapisać kart.");
        return;
      }
      setSuccess(`Zapisano ${data.saved} kart do kolekcji.`);
      setSuggestions([]);
      setText("");
    } catch {
      setError("Nie można połączyć się z serwerem.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateCard(id: string, update: Partial<SuggestionCard>) {
    setSuggestions((prev) => prev.map((c) => (c.id === id ? { ...c, ...update } : c)));
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <div className="space-y-3">
        <label htmlFor="source-text" className="block text-sm font-medium text-blue-100/80">
          Tekst źródłowy
        </label>
        <Textarea
          id="source-text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
            setSuccess(null);
          }}
          placeholder="Wklej tekst do przetworzenia (min. 50 słów)..."
          rows={8}
          className={cn(
            "bg-white/5 text-white placeholder:text-blue-100/30",
            charCount > 3000 && "border-yellow-400/50",
          )}
        />
        <div className="flex items-center justify-between text-xs text-blue-100/50">
          <span className={cn(text.length > 0 && wordCount < 50 && "text-orange-300/80")}>
            {wordCount} {wordCount === 1 ? "słowo" : "słów"}
            {text.length > 0 && wordCount < 50 && " (min. 50)"}
          </span>
          <span className={cn(charCount > 3000 && "text-yellow-300/80")}>{charCount} znaków</span>
        </div>

        <Button onClick={handleGenerate} disabled={!canGenerate} className="w-full">
          {isGenerating ? (
            <>
              <Loader2 className="animate-spin" />
              Generuję...
            </>
          ) : (
            <>
              <Sparkles />
              Generuj
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {success && (
        <div className="rounded-lg border border-green-400/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
          {success}
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-medium text-blue-100/80">
            Sugestie ({acceptedCount} z {suggestions.length} zaznaczonych)
          </h2>

          <div className="space-y-3">
            {suggestions.map((card) => (
              <CardReviewItem
                key={card.id}
                card={card}
                onToggleAccept={() => {
                  updateCard(card.id, { accepted: !card.accepted });
                }}
                onStartEdit={() => {
                  updateCard(card.id, { editing: true, editFront: card.front, editBack: card.back });
                }}
                onSaveEdit={(front, back) => {
                  updateCard(card.id, { front, back, editFront: front, editBack: back, editing: false });
                }}
                onCancelEdit={() => {
                  updateCard(card.id, { editing: false });
                }}
              />
            ))}
          </div>

          <Button onClick={handleSave} disabled={!canSave} className="w-full">
            {isSaving ? (
              <>
                <Loader2 className="animate-spin" />
                Zapisuję...
              </>
            ) : (
              <>
                <Save />
                Zapisz zaakceptowane ({acceptedCount})
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
