import { useCallback, useState } from "react";

export interface Onboarding {
  /** Whether the wizard should currently be shown. */
  open: boolean;
  /** Manually (re)open the tour, e.g. from the help button. */
  openWizard: () => void;
  /** Dismiss the tour for the current view. */
  closeWizard: () => void;
  /** Dismiss the tour permanently so it won't pop up again automatically. */
  dismissPermanently: () => void;
}

export interface UseOnboardingOptions {
  /** Whether onboarding has already been dismissed for this project. */
  dismissed?: boolean;
  /** Callback invoked when the user chooses "Don't show again" or finishes the tour. */
  onDismiss?: () => void;
}

/**
 * Onboarding tour state. By default, the wizard opens on first run unless already
 * dismissed for the workspace/project. `openWizard` lets the help button replay
 * it on demand, and `dismissPermanently` marks it dismissed so it won't auto-open
 * on subsequent reloads.
 */
export function useOnboarding(
  options?: UseOnboardingOptions | boolean,
): Onboarding {
  const dismissed = typeof options === "boolean" ? options : options?.dismissed;
  const onDismiss = typeof options === "object" ? options?.onDismiss : undefined;

  const [open, setOpen] = useState(() => !dismissed);
  const openWizard = useCallback(() => setOpen(true), []);
  const closeWizard = useCallback(() => setOpen(false), []);
  const dismissPermanently = useCallback(() => {
    onDismiss?.();
    setOpen(false);
  }, [onDismiss]);

  return { open, openWizard, closeWizard, dismissPermanently };
}
