import { FolderOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { listDocuments } from "@/lib/documents/store";
import { UploadDocumentForm } from "@/components/documents/UploadDocumentForm";
import { DocumentsList } from "@/components/documents/DocumentsList";

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-muted">Sign in to manage your documents.</p>
      </div>
    );
  }

  const documents = await listDocuments(supabase, user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <FolderOpen className="h-5 w-5 text-accent" /> Documents
        </h1>
        <p className="mt-1 text-sm text-muted">
          Your resumes and grant materials, the Application &amp; Outreach agent&apos;s memory. It fills
          job and grant applications from these, and tailors outreach with them. Mark a default resume so
          the agent knows which to use.
        </p>
      </header>

      <UploadDocumentForm />

      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong bg-surface/40 px-6 py-12 text-center">
          <span className="mx-auto mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-2">
            <FolderOpen className="h-5 w-5 text-accent" />
          </span>
          <h2 className="text-sm font-semibold text-foreground">No documents yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
            Add your resume to get started. The agent reads its text to fill applications and personalize
            outreach.
          </p>
        </div>
      ) : (
        <DocumentsList documents={documents} />
      )}
    </div>
  );
}
