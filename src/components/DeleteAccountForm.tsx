import React, { useState } from "react";
import * as Sentry from "@sentry/astro";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeleteResponse {
  ok?: boolean;
  error?: string;
}

export function DeleteAccountForm() {
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (res.ok) {
        window.location.assign("/?deleted=1");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as DeleteResponse;
      setError(data.error ?? "Nie udało się usunąć konta. Spróbuj ponownie.");
      setSubmitting(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Account deletion request failed:", err);
      Sentry.captureException(err);
      setError("Wystąpił błąd sieci. Spróbuj ponownie.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 text-left text-sm text-blue-100/80">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => {
            setConfirmed(e.target.checked);
          }}
          disabled={submitting}
          className="mt-0.5 size-4 shrink-0 accent-red-500"
        />
        <span>Rozumiem, że ta operacja jest nieodwracalna i trwale usunie moje konto wraz ze wszystkimi fiszkami.</span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}

      <Button variant="destructive" disabled={!confirmed || submitting} onClick={handleDelete} className="w-full">
        {submitting && <Loader2 className="animate-spin" />}
        {submitting ? "Usuwanie…" : "Usuń moje konto"}
      </Button>
    </div>
  );
}
