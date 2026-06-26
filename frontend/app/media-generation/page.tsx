import { redirect } from "next/navigation";

/**
 * AI Image Generation — redirects to the AI jobs dashboard.
 * The actual generation happens inside individual proposal pages.
 */
export default function MediaGenerationPage() {
  redirect("/proposals");
}
