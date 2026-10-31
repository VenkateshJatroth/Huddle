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
  | "location"
  | "language"
  | "more"
  | "close"
  | "send"
  | "settings";

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
  location: { ios: "mappin.and.ellipse", android: "location_on", web: "location_on" },
  language: { ios: "character.bubble", android: "translate", web: "translate" },
  more: { ios: "ellipsis", android: "more_horiz", web: "more_horiz" },
  close: { ios: "xmark", android: "close", web: "close" },
  send: { ios: "paperplane", android: "send", web: "send" },
  settings: { ios: "gearshape", android: "settings", web: "settings" },
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
