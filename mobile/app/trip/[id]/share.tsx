import { useLocalSearchParams, useRouter } from "expo-router";
import { EmptyState, Screen } from "../../../src/components/ui";
import { ShareTripStudio } from "../../../src/features/trips/ShareTripStudio";
import { useLogbook } from "../../../src/state/logbook-context";

export default function ShareTripRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { logbook, ready, update } = useLogbook();
  const trip = logbook.trips.find((item) => item.id === id);
  if (!ready) return <Screen><EmptyState title="Opening share studio…" /></Screen>;
  if (!trip) return <Screen><EmptyState title="Trip not found" /></Screen>;
  return <ShareTripStudio logbook={logbook} trip={trip} update={update} onClose={() => router.canGoBack() ? router.back() : router.replace(`/trip/${trip.id}`)} />;
}
