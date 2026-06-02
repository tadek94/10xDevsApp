import React, { useState } from "react";
import { Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FlashcardItem, type CollectionCard } from "@/components/flashcards/FlashcardItem";

interface FlashcardCollectionProps {
  initialCards: CollectionCard[];
}

interface SaveResponse {
  saved?: number;
  cards?: CollectionCard[];
  error?: string;
}

function redirectToSignin() {
  window.location.href = "/auth/signin";
}

export function FlashcardCollection({ initialCards }: FlashcardCollectionProps) {
  const [cards, setCards] = useState<CollectionCard[]>(initialCards);
  const [adding, setAdding] = useState(false);
  const [newFront, setNewFront] = useState("");
  const [newBack, setNewBack] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: [{ front: newFront, back: newBack }] }),
      });
      if (res.status === 401) {
        redirectToSignin();
        return;
      }
      const data: SaveResponse = await res.json();
      const created = data.cards;
      if (!res.ok || !created) {
        setError(data.error ?? "Nie udało się zapisać karty.");
        return;
      }
      // Prepend the freshly created card(s) — they carry real id/created_at from the DB.
      setCards((prev) => [...created, ...prev]);
      setNewFront("");
      setNewBack("");
      setAdding(false);
    } catch {
      setError("Nie można połączyć się z serwerem.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleSaved(updated: CollectionCard) {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
  }

  function handleDeleted(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-2xl font-bold text-transparent">
          Moja kolekcja
        </h1>
        <span className="text-xs text-blue-100/50">
          {cards.length} {cards.length === 1 ? "karta" : "kart"}
        </span>
      </div>

      {!adding && (
        <Button
          onClick={() => {
            setError(null);
            setAdding(true);
          }}
          className="w-full"
        >
          <Plus />
          Dodaj kartę
        </Button>
      )}

      {adding && (
        <div className="space-y-3 rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-blue-100/70">Przód</label>
            <Textarea
              value={newFront}
              onChange={(e) => {
                setNewFront(e.target.value);
              }}
              className="min-h-10 bg-white/5 text-white placeholder:text-blue-100/30"
              rows={2}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-blue-100/70">Tył</label>
            <Textarea
              value={newBack}
              onChange={(e) => {
                setNewBack(e.target.value);
              }}
              className="min-h-10 bg-white/5 text-white placeholder:text-blue-100/30"
              rows={3}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={isSaving || !newFront.trim() || !newBack.trim()}>
              {isSaving ? <Loader2 className="animate-spin" /> : <Save />}
              Zapisz kartę
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setNewFront("");
                setNewBack("");
              }}
              disabled={isSaving}
              className="text-blue-100/70 hover:text-white"
            >
              Anuluj
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {cards.length === 0 ? (
        <div className="rounded-xl border border-white/15 bg-white/5 p-8 text-center text-sm text-blue-100/60">
          Brak kart. Dodaj pierwszą powyżej albo{" "}
          <a href="/generate" className="text-purple-300 underline hover:text-purple-200">
            wygeneruj je z tekstu
          </a>
          .
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((card) => (
            <FlashcardItem
              key={card.id}
              card={card}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              onUnauthorized={redirectToSignin}
            />
          ))}
        </div>
      )}
    </div>
  );
}
