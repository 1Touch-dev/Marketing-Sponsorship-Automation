import { PageHeader } from "@/components/shared/page-header";
import { ProductDiscoveryClient } from "./product-discovery-client";

export const dynamic = "force-dynamic";

export default function ProductDiscoveryPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Discovery"
        description="Enter a product or goods type — automatically find companies that sell or manufacture it across your city, state, and nationally, and save the best prospects."
      />
      <ProductDiscoveryClient />
    </div>
  );
}
