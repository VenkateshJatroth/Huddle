import { Avatar } from "./ui";
import { demoAvatarSheet, getDemoAvatarTile } from "../data/mockMedia";

export function DemoAvatar({
  id,
  name,
  tone = 0,
  size = 44,
}: {
  id: string;
  name: string;
  tone?: number;
  size?: number;
}) {
  const imageTileIndex = getDemoAvatarTile(id);

  return (
    <Avatar
      name={name}
      tone={tone}
      size={size}
      imageSource={imageTileIndex === undefined ? undefined : demoAvatarSheet}
      imageKey={id}
      imageTileIndex={imageTileIndex}
    />
  );
}
