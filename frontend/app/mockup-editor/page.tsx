import { PageHeader } from "@/components/shared/page-header";
import { MockupEditorClient } from "./mockup-editor-client";

export const dynamic = "force-dynamic";

export default function MockupEditorPage() {
  return (
    <>
      <PageHeader
        title="Mockup Editor"
        description="Drag & drop sponsor logos onto Coritiba FC templates — export PNG"
      />
      <MockupEditorClient />
    </>
  );
}
