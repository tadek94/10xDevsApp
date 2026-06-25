import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReviewCard, ReviewRating } from "@/types";

interface ReviewSessionProps {
  initialCards: ReviewCard[];
}

interface ReviewResponse {
  card?: { id: string; front: string; back: string; srs_due: string };
  error?: string;
}

const RATINGS: { value: ReviewRating; label: string; className: string }[] = [
  { value: "again", label: "Znowu", className: "border-red-400/40 bg-red-500/15 text-red-200 hover:bg-red-500/25" },
  {
    value: "hard",
    label: "Trudne",
    className: "border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25",
  },
  {
    value: "good",
    label: "Dobre",
    className: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25",
  },
  { value: "easy", label: "Łatwe", className: "border-blue-400/40 bg-blue-500/15 text-blue-200 hover:bg-blue-500/25" },
];

function redirectToSignin() {
  window.location.href = "/auth/signin";
}

export function ReviewSession({ initialCards }: ReviewSessionProps) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = initialCards.length;

  // No due cards — the SRS schedule has nothing for the user right now.
  if (total === 0) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4">
        <div className="rounded-xl border border-white/15 bg-white/5 p-8 text-center text-sm text-blue-100/60">
          Brak kart do powtórki. Wróć później albo{" "}
          <a href="/generate" className="text-purple-300 underline hover:text-purple-200">
            wygeneruj nowe
          </a>{" "}
          lub{" "}
          <a href="/flashcards" className="text-blue-300 underline hover:text-blue-200">
            przejrzyj kolekcję
          </a>
          .
        </div>
      </div>
    );
  }

  // Session finished — every due card has been reviewed.
  if (index >= total) {
    return (
      <div className="mx-auto w-full max-w-2xl p-4">
        <div className="rounded-xl border border-white/20 bg-white/10 p-8 text-center backdrop-blur-sm">
          <h2 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-2xl font-bold text-transparent">
            Sesja zakończona 🎉
          </h2>
          <p className="mt-2 text-sm text-blue-100/70">
            Przejrzano {total} {total === 1 ? "kartę" : "kart"}.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <a
              href="/flashcards"
              className="rounded-lg border border-blue-400/40 bg-blue-500/20 px-4 py-2 text-sm font-medium text-blue-200 transition-colors hover:bg-blue-500/30"
            >
              Moja kolekcja
            </a>
            <a
              href="/dashboard"
              className="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-blue-100 transition-colors hover:bg-white/20"
            >
              Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  const card = initialCards[index];

  async function handleRate(rating: ReviewRating) {
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/flashcards/${card.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating }),
      });
      if (res.status === 401) {
        redirectToSignin();
        return;
      }
      const data: ReviewResponse = await res.json();
      if (!res.ok || !data.card) {
        setError(data.error ?? "Nie udało się zapisać oceny.");
        return;
      }
      // Persisted server-side; advance to the next card.
      setIndex((i) => i + 1);
      setRevealed(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Review submission request failed:", err);
      setError("Nie można połączyć się z serwerem.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-2xl font-bold text-transparent">
          Sesja powtórek
        </h1>
        <span className="text-xs text-blue-100/50">
          {index + 1} / {total}
        </span>
      </div>

      {total < 3 && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Mała talia — harmonogram powtórek będzie przybliżony. Dodaj więcej kart, by spaced repetition działał lepiej.
        </div>
      )}

      <div className="rounded-xl border border-white/20 bg-white/10 p-6 backdrop-blur-sm">
        <p className="text-xs font-medium tracking-wide text-blue-100/50 uppercase">Pytanie</p>
        <p className="mt-2 text-lg font-semibold text-white">{card.front}</p>
        {revealed && (
          <>
            <hr className="my-4 border-white/10" />
            <p className="text-xs font-medium tracking-wide text-blue-100/50 uppercase">Odpowiedź</p>
            <p className="mt-2 text-base text-blue-100/90">{card.back}</p>
          </>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {!revealed ? (
        <Button
          className="w-full"
          onClick={() => {
            setRevealed(true);
          }}
        >
          Pokaż odpowiedź
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RATINGS.map((r) => (
            <Button
              key={r.value}
              variant="outline"
              disabled={isSubmitting}
              onClick={() => handleRate(r.value)}
              className={r.className}
            >
              {isSubmitting ? <Loader2 className="animate-spin" /> : null}
              {r.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
