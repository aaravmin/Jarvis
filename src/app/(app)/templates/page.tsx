import Link from "next/link";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getConnection } from "@/lib/google/store";
import { listTemplates, listConnectionTypes } from "@/lib/templates/store";
import { ConnectionEmailComposer } from "@/components/templates/ConnectionEmailComposer";
import { TemplatesManager } from "@/components/templates/TemplatesManager";
import { NewTemplateForm } from "@/components/templates/NewTemplateForm";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-muted">Sign in to manage email templates.</p>
      </div>
    );
  }

  const [templates, connectionTypes, connection] = await Promise.all([
    listTemplates(supabase, user.id),
    listConnectionTypes(supabase, user.id),
    getConnection(supabase, user.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <FileText className="h-5 w-5 text-accent" /> Email templates
        </h1>
        <p className="mt-1 text-sm text-muted">
          Reusable templates and the connection types they fit. Jarvis adapts a template to a contact you
          have a personal connection to, then saves a generalized version for next time, never the
          personal details.
        </p>
        {!connection && (
          <p className="mt-2 text-xs text-muted">
            Tip: <Link href="/connections" className="text-accent underline">connect Google</Link> to pull
            a base template straight from a Drive doc.
          </p>
        )}
      </header>

      <ConnectionEmailComposer templates={templates} connectionTypes={connectionTypes} />
      <NewTemplateForm />
      <TemplatesManager templates={templates} connectionTypes={connectionTypes} />
    </div>
  );
}
