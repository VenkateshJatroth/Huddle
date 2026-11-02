import { useLocalSearchParams } from "expo-router";
import { MemberProfileView } from "../../components/MemberProfileView";

export default function MemberProfileDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  if (!id) return null;

  return <MemberProfileView memberId={id} />;
}
