"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CheckIcon } from "@radix-ui/react-icons";
import { createNoteAction } from "@/app/notes/actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Textarea } from "@/components/ui/Textarea";
import { noteSchema, type NoteFormValues } from "@/lib/validations/note";

export function NoteForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NoteFormValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: {
      title: "",
      sourceUrl: "",
      sourceTitle: "",
      selectedText: "",
      rawThought: "",
      tags: "",
    },
  });

  function onSubmit(values: NoteFormValues) {
    setServerError(null);

    startTransition(async () => {
      const result = await createNoteAction(values);

      if (!result.ok) {
        setServerError(result.message);
        return;
      }

      router.push("/notes");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="reveal space-y-7 border border-[var(--border)] bg-white p-6 md:p-8"
      style={{ "--index": 2 } as CSSProperties}
    >
      <Field label="Note title" error={errors.title?.message}>
        <Input placeholder="What is this note about?" {...register("title")} />
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Source URL" error={errors.sourceUrl?.message}>
          <Input
            placeholder="https://example.com/paper"
            {...register("sourceUrl")}
          />
        </Field>
        <Field label="Source title" error={errors.sourceTitle?.message}>
          <Input
            placeholder="Paper or article title"
            {...register("sourceTitle")}
          />
        </Field>
      </div>

      <Field label="Selected text" error={errors.selectedText?.message}>
        <Textarea
          placeholder="Paste the passage that triggered this thought."
          {...register("selectedText")}
        />
      </Field>

      <Field label="Your thought" error={errors.rawThought?.message}>
        <Textarea
          placeholder="Capture the idea, question, critique, or connection."
          className="min-h-36"
          {...register("rawThought")}
        />
      </Field>

      <Field label="Tags" error={errors.tags?.message}>
        <Input
          placeholder="literature review, methods, contradiction"
          {...register("tags")}
        />
      </Field>

      {serverError ? (
        <p className="border border-[var(--pastel-red)] bg-[var(--pastel-red)] px-3 py-2 text-sm text-[var(--pastel-red-text)]">
          {serverError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          <CheckIcon className="h-4 w-4" />
          {isPending ? "Saving..." : "Save note"}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
