"use client";

import { useActionState } from "react";
import {
  claimSlot,
  releaseSlot,
  type SlotActionState,
} from "@/app/_actions/slots";

const initial: SlotActionState = { phase: "idle" };

export function ClaimButton({ slotId }: { slotId: string }) {
  const [state, action, pending] = useActionState(claimSlot, initial);
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="slotId" value={slotId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {pending ? "Claiming..." : "Claim"}
      </button>
      {state.phase === "error" ? (
        <span className="text-xs text-red-700 dark:text-red-400">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function ReleaseButton({ slotId }: { slotId: string }) {
  const [state, action, pending] = useActionState(releaseSlot, initial);
  return (
    <form action={action} className="inline-flex items-center gap-2">
      <input type="hidden" name="slotId" value={slotId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
      >
        {pending ? "Releasing..." : "Release"}
      </button>
      {state.phase === "error" ? (
        <span className="text-xs text-red-700 dark:text-red-400">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
