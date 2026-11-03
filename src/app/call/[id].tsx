import { useLocalSearchParams } from "expo-router";
import { CallScreen } from "../../components/calling/CallScreen";
import type { CallType } from "../../lib/calling";

export default function CallRoute() {
  const {
    id,
    callId,
    type = "voice",
    incoming = "false",
    channelId,
  } = useLocalSearchParams<{
    id: string;
    callId?: string;
    type?: CallType;
    incoming?: string;
    channelId?: string;
  }>();

  return (
    <CallScreen
      memberId={id}
      callId={callId}
      callType={type}
      isIncoming={incoming === "true"}
      channelId={channelId}
    />
  );
}
