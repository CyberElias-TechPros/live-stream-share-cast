import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => (
  <Sonner
    theme="dark"
    position="bottom-right"
    className="toaster group"
    toastOptions={{
      classNames: {
        toast:
          "group [border-radius:12px] bg-panel-2 text-text border border-line-strong shadow-2xl shadow-black/50",
        description: "[color:hsl(var(--text-muted))]",
        actionButton: "bg-text text-bg",
        cancelButton: "bg-panel text-text-muted",
      },
    }}
    {...props}
  />
);

export { Toaster, toast };
