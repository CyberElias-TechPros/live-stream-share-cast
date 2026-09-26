import { useRef, useState } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { profileService } from "@/services/profileService";
import { useToast } from "@/hooks/use-toast";

interface AvatarUploadButtonProps {
  /** Called with the public URL once the upload succeeds. */
  onUploaded: (url: string) => void | Promise<void>;
  label?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
}

/**
 * Picks an image, uploads it to the worker (`POST /users/me/avatar`, stored in
 * R2) and hands the resulting URL back to the caller. Both the settings form
 * and the profile page use it, so the flow is identical in either place.
 */
export function AvatarUploadButton({
  onUploaded,
  label = "Change Avatar",
  variant = "outline",
  size,
  className,
}: AvatarUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Pick an image file", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Avatars must be smaller than 5 MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const url = await profileService.uploadAvatar(file, file.name || "avatar.png");
      if (!url) throw new Error("Upload failed");
      await onUploaded(url);
      toast({ title: "Avatar updated", description: "Your new picture is live." });
    } catch {
      toast({ title: "Could not upload the avatar", description: "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <UploadCloud className="mr-2 h-4 w-4" />
        )}
        {uploading ? "Uploading…" : label}
      </Button>
    </>
  );
}

export default AvatarUploadButton;
