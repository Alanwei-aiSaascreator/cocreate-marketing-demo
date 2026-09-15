import { listMerchants } from "@/lib/queries";
import { NewCampaignWizard } from "@/components/NewCampaignWizard";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const merchants = await listMerchants();
  return <NewCampaignWizard merchants={merchants} />;
}
