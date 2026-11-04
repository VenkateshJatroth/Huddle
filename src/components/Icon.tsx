import { SymbolView } from "expo-symbols";
import type { SymbolViewProps } from "expo-symbols";

export type AppIconName =
  | "home"
  | "bell"
  | "heart"
  | "chat"
  | "share"
  | "search"
  | "photo"
  | "globe"
  | "sparkles"
  | "plus"
  | "people"
  | "person"
  | "check"
  | "chevronRight"
  | "chevronLeft"
  | "arrowBack"
  | "location"
  | "language"
  | "more"
  | "close"
  | "send"
  | "bookmark"
  | "settings"
  | "phone"
  | "video"
  | "lock"
  | "mic"
  | "play"
  | "pause"
  | "trash"
  | "phoneMissed"
  | "phoneIncoming"
  | "phoneOutgoing";

const iconNames = {
  home: { ios: "house", android: "home", web: "home" },
  bell: { ios: "bell", android: "notifications", web: "notifications" },
  heart: { ios: "heart", android: "favorite", web: "favorite" },
  chat: { ios: "bubble.left", android: "chat_bubble_outline", web: "chat_bubble_outline" },
  share: { ios: "square.and.arrow.up", android: "ios_share", web: "ios_share" },
  search: { ios: "magnifyingglass", android: "search", web: "search" },
  photo: { ios: "photo", android: "add_photo_alternate", web: "add_photo_alternate" },
  globe: { ios: "globe", android: "language", web: "language" },
  sparkles: { ios: "sparkles", android: "auto_awesome", web: "auto_awesome" },
  plus: { ios: "plus", android: "add", web: "add" },
  people: { ios: "person.2", android: "groups", web: "groups" },
  person: { ios: "person.crop.circle", android: "account_circle", web: "account_circle" },
  check: { ios: "checkmark", android: "check", web: "check" },
  chevronRight: { ios: "chevron.right", android: "chevron_right", web: "chevron_right" },
  chevronLeft: { ios: "chevron.left", android: "arrow_back", web: "arrow_back" },
  arrowBack: { ios: "chevron.left", android: "arrow_back", web: "arrow_back" },
  location: { ios: "mappin.and.ellipse", android: "location_on", web: "location_on" },
  language: { ios: "character.bubble", android: "translate", web: "translate" },
  more: { ios: "ellipsis", android: "more_horiz", web: "more_horiz" },
  close: { ios: "xmark", android: "close", web: "close" },
  send: { ios: "paperplane", android: "send", web: "send" },
  bookmark: { ios: "bookmark", android: "bookmark", web: "bookmark" },
  settings: { ios: "gearshape", android: "settings", web: "settings" },
  phone: { ios: "phone", android: "phone", web: "phone" },
  video: { ios: "video", android: "videocam", web: "videocam" },
  lock: { ios: "lock", android: "lock", web: "lock" },
  mic: { ios: "mic", android: "mic", web: "mic" },
  play: { ios: "play.fill", android: "play_arrow", web: "play_arrow" },
  pause: { ios: "pause.fill", android: "pause", web: "pause" },
  trash: { ios: "trash", android: "delete", web: "delete" },
  phoneMissed: { ios: "phone.down", android: "phone_missed", web: "phone_missed" },
  phoneIncoming: { ios: "phone.arrow.down.left", android: "call_received", web: "call_received" },
  phoneOutgoing: { ios: "phone.arrow.up.right", android: "call_made", web: "call_made" },
} satisfies Record<AppIconName, SymbolViewProps["name"]>;

type IconProps = {
  name: AppIconName;
  color: string;
  size?: number;
};

export function Icon({ name, color, size = 20 }: IconProps) {
  return (
    <SymbolView
      name={iconNames[name]}
      tintColor={color}
      size={size}
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
