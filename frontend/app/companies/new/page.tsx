import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CompanyForm } from "../company-form";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default function NewCompanyPage() {
  return (
    <>
      <PageHeader
        title="Add Company"
        description="Add a new sponsor or prospect to the platform"
        actions={
          <Link href="/companies">
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back to Companies
            </Button>
          </Link>
        }
      />
      <div className="max-w-2xl">
        <Card>
          <CardContent className="pt-6">
            <CompanyForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
