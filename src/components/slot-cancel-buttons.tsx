"use client";

import { useActionState } from "react";
import {
  cancelSlot,
  cancelRequest,
  type SlotActionState,
} from "@/app/_actions/slots";

const initial: SlotActionState = { phase: "idle" };

export function CancelSlotButton({ slotId }: { slotId: string }) {
  const [state, action, pending] = useActionState(cancelSlot, initial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Cancel this block? It will disappear from open coverage and the claimer (if any) will be notified."))
          e.preventDefault();
      }}
      className="inline-flex items-center gap-2"
    >
      <input type="hidden" name="slotId" value={slotId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
      >
        {pending ? "Cancelling..." : "Cancel block"}
      </button>
      {state.phase === "error" ? (
        <span className="text-xs text-red-700 dark:text-red-400">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function CancelRequestButton({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(cancelRequest, initial);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (
          !confirm(
            "Cancel this entire request? Every block in it will be marked cancelled. This cannot be undone (history is preserved for reports).",
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
      >
        {pending ? "Cancelling..." : "Cancel entire request"}
      </button>
      {state.phase === "error" ? (
        <span className="ml-2 text-xs text-red-700 dark:text-red-400">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
