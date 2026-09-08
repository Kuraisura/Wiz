import { Toaster as Sonner } from "sonner";

const Toaster = ({ ...props }) => {
  return (
    <Sonner
      theme={document.documentElement.classList.contains("dark") ? "dark" : "light"}
      className="toaster group"
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        duration: 3000,
        classNames: {
          toast: "group toast group-[.toast]:bg-card group-[.toast]:text-foreground group-[.toast]:border-border group-[.toast]:shadow-xl group-[.toast]:rounded-2xl group-[.toast]:px-5 group-[.toast]:py-4 group-[.toast]:backdrop-blur-xl",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-sm",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          error: "group-[.toast]:bg-red-50 group-[.toast]:text-red-700 group-[.toast]:border-red-200 dark:group-[.toast]:bg-red-950/60 dark:group-[.toast]:text-red-300 dark:group-[.toast]:border-red-800/40",
          success: "group-[.toast]:bg-emerald-50 group-[.toast]:text-emerald-700 group-[.toast]:border-emerald-200 dark:group-[.toast]:bg-emerald-950/60 dark:group-[.toast]:text-emerald-300 dark:group-[.toast]:border-emerald-800/40",
          warning: "group-[.toast]:bg-amber-50 group-[.toast]:text-amber-700 group-[.toast]:border-amber-200 dark:group-[.toast]:bg-amber-950/60 dark:group-[.toast]:text-amber-300 dark:group-[.toast]:border-amber-800/40",
          info: "group-[.toast]:bg-blue-50 group-[.toast]:text-blue-700 group-[.toast]:border-blue-200 dark:group-[.toast]:bg-blue-950/60 dark:group-[.toast]:text-blue-300 dark:group-[.toast]:border-blue-800/40",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
