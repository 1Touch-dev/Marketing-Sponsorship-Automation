import { redirect } from "next/navigation";

/**
 * /campaigns/new redirects to /campaigns where the inline generator lives.
 * This prevents the 404 that was seen when the E2E guide sent testers here.
 */
export default function NewCampaignRedirect({
  searchParams,
}: {
  searchParams: { company?: string };
}) {
  const params = searchParams.company ? `?company=${searchParams.company}` : "";
  redirect(`/campaigns${params}`);
}
