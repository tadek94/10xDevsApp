import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface CollectionCard {
  id: string;
  front: string;
  back: string;
  created_at: string;
}

interface FlashcardItemProps {
  card: CollectionCard;
  onSaved: (card: CollectionCard) => void;
  onDeleted: (id: string) => void;
  onUnauthorized: () => void;
}

interface UpdateResponse {
  card?: CollectionCard;
  error?: string;
}

export function FlashcardItem({ card, onSaved, onDeleted, onUnauthorized }: FlashcardItemProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit() {
    setFront(card.front);
    setBack(card.back);
    setError(null);
    setEditing(true);
  }

  async function handleSaveEdit() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/flashcards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front, back }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      const data: UpdateResponse = await res.json();
      if (!res.ok || !data.card) {
        setError(data.error ?? "Nie udało się zapisać zmian.");
        return;
      }
      onSaved(data.card);
      setEditing(false);
    } catch {
      setError("Nie można połączyć się z serwerem.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/flashcards/${card.id}`, { method: "DELETE" });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) {
        const data: { error?: string } = await res.json();
        setError(data.error ?? "Nie udało się usunąć karty.");
        return;
      }
      onDeleted(card.id);
    } catch {
      setError("Nie można połączyć się z serwerem.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-blue-100/70">Przód</label>
            <Textarea
              value={front}
              onChange={(e) => {
                setFront(e.target.value);
              }}
              className="min-h-10 bg-white/5 text-white placeholder:text-blue-100/30"
              rows={2}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-blue-100/70">Tył</label>
            <Textarea
              value={back}
              onChange={(e) => {
                setBack(e.target.value);
              }}
              className="min-h-10 bg-white/5 text-white placeholder:text-blue-100/30"
              rows={3}
            />
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveEdit} disabled={busy || !front.trim() || !back.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Zapisz edycję
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
              }}
              disabled={busy}
              className="text-blue-100/70 hover:text-white"
            >
              Anuluj
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{card.front}</p>
          <p className="mt-1 text-sm text-blue-100/70">{card.back}</p>
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
        </div>
        {confirming ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-blue-100/70">Na pewno?</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={busy}
              className="text-red-300 hover:text-red-200"
            >
              {busy ? <Loader2 className="animate-spin" /> : null}
              Tak
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirming(false);
              }}
              disabled={busy}
              className="text-blue-100/70 hover:text-white"
            >
              Anuluj
            </Button>
          </div>
        ) : (
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={startEdit} className="text-blue-100/50 hover:text-white">
              Edytuj
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
              className="text-blue-100/50 hover:text-red-300"
            >
              Usuń
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
