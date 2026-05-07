"use client";

import { useActionState, useRef, useState } from "react";
import {
  updateSlotDetails,
  addSlotFile,
  removeSlotFile,
  type SlotActionState,
} from "@/app/_actions/slots";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const initial: SlotActionState = { phase: "idle" };
const idle = initial;

type SlotFile = { id: string; fileName: string; url: string | null };

export function SlotEditor({
  slotId,
  initialCourseTitle,
  initialCurriculumText,
  initialCurriculumUrl,
  initialNotes,
  initialFiles,
}: {
  slotId: string;
  initialCourseTitle: string;
  initialCurriculumText: string;
  initialCurriculumUrl: string;
  initialNotes: string;
  initialFiles: SlotFile[];
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="mt-3 border-t border-zinc-200 pt-3 text-sm dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Edit details
        </button>
      </div>
    );
  }

  return (
    <SlotEditPanel
      slotId={slotId}
      initialCourseTitle={initialCourseTitle}
      initialCurriculumText={initialCurriculumText}
      initialCurriculumUrl={initialCurriculumUrl}
      initialNotes={initialNotes}
      initialFiles={initialFiles}
      onClose={() => setEditing(false)}
    />
  );
}

function SlotEditPanel({
  slotId,
  initialCourseTitle,
  initialCurriculumText,
  initialCurriculumUrl,
  initialNotes,
  initialFiles,
  onClose,
}: {
  slotId: string;
  initialCourseTitle: string;
  initialCurriculumText: string;
  initialCurriculumUrl: string;
  initialNotes: string;
  initialFiles: SlotFile[];
  onClose: () => void;
}) {
  const [courseTitle, setCourseTitle] = useState(initialCourseTitle);
  const [curriculumText, setCurriculumText] = useState(initialCurriculumText);
  const [curriculumUrl, setCurriculumUrl] = useState(initialCurriculumUrl);
  const [notes, setNotes] = useState(initialNotes);
  const [files, setFiles] = useState<SlotFile[]>(initialFiles);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [saveState, saveAction, saving] = useActionState(
    updateSlotDetails,
    initial,
  );
  const [removeState, removeAction, removing] = useActionState(
    removeSlotFile,
    initial,
  );

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files;
    if (!picked || picked.length === 0) return;
    setUploadError(null);

    const supabase = createSupabaseBrowserClient();
    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr) {
      console.error("[upload] auth error", authErr);
      setUploadError(`Auth: ${authErr.message}`);
      e.target.value = "";
      return;
    }
    const userId = userData?.user?.id;
    if (!userId) {
      setUploadError("Sign in required to upload.");
      e.target.value = "";
      return;
    }

    const list = Array.from(picked);
    e.target.value = "";
    setUploading((c) => c + list.length);

    try {
      for (const f of list) {
        const safeName = f.name.replace(/[^A-Za-z0-9._-]+/g, "_");
        const path = `requests/${userId}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}-${safeName}`;

        console.log("[upload] starting", { fileName: f.name, size: f.size, path });

        const upload = await supabase.storage
          .from("curriculum")
          .upload(path, f, { upsert: false });

        if (upload.error) {
          console.error("[upload] storage error", upload.error);
          setUploadError(`Storage: ${upload.error.message}`);
          continue;
        }
        console.log("[upload] stored", upload.data);

        // Record server-side. Awaited so we know it succeeded before showing it.
        const fd = new FormData();
        fd.set("slotId", slotId);
        fd.set("storagePath", path);
        fd.set("fileName", f.name);
        const recordResult = await addSlotFile(idle, fd);

        if (recordResult.phase === "error") {
          console.error("[upload] db record error", recordResult.message);
          setUploadError(`DB: ${recordResult.message}`);
          continue;
        }
        console.log("[upload] recorded");

        const { data: signed } = await supabase.storage
          .from("curriculum")
          .createSignedUrl(path, 60 * 60);

        setFiles((curr) => [
          ...curr,
          {
            id: `temp-${path}`,
            fileName: f.name,
            url: signed?.signedUrl ?? null,
          },
        ]);
      }
    } catch (err) {
      console.error("[upload] unexpected", err);
      setUploadError(
        err instanceof Error ? err.message : "Unexpected upload error",
      );
    } finally {
      setUploading((c) => Math.max(0, c - list.length));
    }
  }

  function handleRemoveFile(fileId: string) {
    if (fileId.startsWith("temp-")) {
      // We added it during this edit session and the action ID we track
      // doesn't link cleanly back. Reload-after-save will reconcile from DB.
      setFiles((curr) => curr.filter((f) => f.id !== fileId));
      return;
    }
    const fd = new FormData();
    fd.set("fileId", fileId);
    removeAction(fd);
    setFiles((curr) => curr.filter((f) => f.id !== fileId));
  }

  return (
    <form
      action={saveAction}
      className="mt-3 flex flex-col gap-3 rounded border border-zinc-300 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900/40"
    >
      <input type="hidden" name="slotId" value={slotId} />

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Course title <span className="text-red-600">*</span>
        </span>
        <input
          required
          name="courseTitle"
          value={courseTitle}
          onChange={(e) => setCourseTitle(e.target.value)}
          className={`rounded border bg-white px-2 py-1 dark:bg-zinc-950 ${
            courseTitle.trim().length === 0
              ? "border-red-400 dark:border-red-600"
              : "border-zinc-300 dark:border-zinc-700"
          }`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Lesson plan / instructions
        </span>
        <textarea
          name="curriculumText"
          value={curriculumText}
          onChange={(e) => setCurriculumText(e.target.value)}
          rows={3}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Link to materials
        </span>
        <input
          name="curriculumUrl"
          value={curriculumUrl}
          onChange={(e) => setCurriculumUrl(e.target.value)}
          placeholder="https://..."
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Attached files
        </span>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={onPickFiles}
          className="text-xs"
        />
        {uploading > 0 ? (
          <p className="text-xs text-zinc-500">Uploading {uploading}...</p>
        ) : null}
        {uploadError ? (
          <p className="text-xs text-red-700 dark:text-red-400">
            {uploadError}
          </p>
        ) : null}
        {removeState.phase === "error" ? (
          <p className="text-xs text-red-700 dark:text-red-400">
            {removeState.message}
          </p>
        ) : null}
        {files.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {files.map((f) => (
              <li
                key={f.id}
                className="flex items-center gap-2 rounded border border-zinc-200 bg-white px-2 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-950"
              >
                {f.url ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-zinc-900 underline underline-offset-4 dark:text-zinc-100"
                  >
                    {f.fileName}
                  </a>
                ) : (
                  <span className="truncate">{f.fileName}</span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemoveFile(f.id)}
                  disabled={removing}
                  className="ml-auto text-red-600 hover:underline dark:text-red-400"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Notes
        </span>
        <textarea
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || courseTitle.trim().length === 0 || uploading > 0}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
        >
          Done
        </button>
        {saveState.phase === "ok" ? (
          <span className="text-xs text-emerald-700 dark:text-emerald-400">
            {saveState.message}
          </span>
        ) : null}
        {saveState.phase === "error" ? (
          <span className="text-xs text-red-700 dark:text-red-400">
            {saveState.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
