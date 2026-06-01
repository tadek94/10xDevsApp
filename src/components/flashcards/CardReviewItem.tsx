import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface CardReviewItemProps {
  card: {
    id: string;
    front: string;
    back: string;
    accepted: boolean;
    editing: boolean;
    editFront: string;
    editBack: string;
  };
  onToggleAccept: () => void;
  onStartEdit: () => void;
  onSaveEdit: (front: string, back: string) => void;
  onCancelEdit: () => void;
}

interface EditFormProps {
  initialFront: string;
  initialBack: string;
  onSave: (front: string, back: string) => void;
  onCancel: () => void;
}

function EditForm({ initialFront, initialBack, onSave, onCancel }: EditFormProps) {
  const [localFront, setLocalFront] = useState(initialFront);
  const [localBack, setLocalBack] = useState(initialBack);

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-blue-100/70">Przód</label>
        <Textarea
          value={localFront}
          onChange={(e) => {
            setLocalFront(e.target.value);
          }}
          className="min-h-10 bg-white/5 text-white placeholder:text-blue-100/30"
          rows={2}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-blue-100/70">Tył</label>
        <Textarea
          value={localBack}
          onChange={(e) => {
            setLocalBack(e.target.value);
          }}
          className="min-h-10 bg-white/5 text-white placeholder:text-blue-100/30"
          rows={3}
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            onSave(localFront, localBack);
          }}
          disabled={!localFront.trim() || !localBack.trim()}
        >
          Zapisz edycję
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="text-blue-100/70 hover:text-white">
          Anuluj
        </Button>
      </div>
    </div>
  );
}

export function CardReviewItem({ card, onToggleAccept, onStartEdit, onSaveEdit, onCancelEdit }: CardReviewItemProps) {
  if (card.editing) {
    return (
      <div className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
        <EditForm
          initialFront={card.editFront}
          initialBack={card.editBack}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm transition-opacity",
        !card.accepted && "opacity-40",
      )}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={card.accepted}
          onChange={onToggleAccept}
          aria-label="Zaakceptuj kartę"
          className="mt-1 h-4 w-4 cursor-pointer accent-purple-400"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{card.front}</p>
          <p className="mt-1 text-sm text-blue-100/70">{card.back}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onStartEdit} className="shrink-0 text-blue-100/50 hover:text-white">
          Edytuj
        </Button>
      </div>
    </div>
  );
}
