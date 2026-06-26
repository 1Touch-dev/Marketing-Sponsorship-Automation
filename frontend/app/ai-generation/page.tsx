import { redirect } from "next/navigation";

/**
 * Legacy /ai-generation route — redirects to proposals where generation lives.
 */
export default function AiGenerationPage() {
  redirect("/proposals");
}
