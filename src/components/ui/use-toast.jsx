// Sonner-based toast with the same API as the old Radix toast
import { toast as sonnerToast } from "sonner";

function toast({ title, description, variant, duration, ...props }) {
  if (variant === "destructive") {
    return sonnerToast.error(title, {
      description,
      duration: duration || 5000,
      ...props,
    });
  }
  if (variant === "success") {
    return sonnerToast.success(title, {
      description,
      duration: duration || 3000,
      ...props,
    });
  }
  return sonnerToast(title, {
    description,
    duration: duration || 3000,
    ...props,
  });
}

function useToast() {
  return { toast, dismiss: sonnerToast.dismiss };
}

export { useToast, toast };
