import { auth } from "@/auth";
import { GrowthView } from "@/components/growth/growth-view";

export default async function HomePage() {
  const session = await auth();
  return <GrowthView userName={session?.user?.name?.split(" ")[0] ?? ""} />;
}
