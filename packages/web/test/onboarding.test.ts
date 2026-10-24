import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { useOnboarding } from "../src/architecture/useOnboarding";

describe("useOnboarding", () => {
  it("initializes open to true when not dismissed", () => {
    let observedOpen: boolean | undefined;
    function Component() {
      const onboarding = useOnboarding();
      observedOpen = onboarding.open;
      return null;
    }
    renderToString(React.createElement(Component));
    expect(observedOpen).toBe(true);
  });

  it("initializes open to false when dismissed is true (boolean)", () => {
    let observedOpen: boolean | undefined;
    function Component() {
      const onboarding = useOnboarding(true);
      observedOpen = onboarding.open;
      return null;
    }
    renderToString(React.createElement(Component));
    expect(observedOpen).toBe(false);
  });

  it("initializes open to false when dismissed option is true", () => {
    let observedOpen: boolean | undefined;
    function Component() {
      const onboarding = useOnboarding({ dismissed: true });
      observedOpen = onboarding.open;
      return null;
    }
    renderToString(React.createElement(Component));
    expect(observedOpen).toBe(false);
  });

  it("calls onDismiss when dismissPermanently is invoked", () => {
    const onDismiss = vi.fn();
    let handler: (() => void) | undefined;
    function Component() {
      const onboarding = useOnboarding({ dismissed: false, onDismiss });
      handler = onboarding.dismissPermanently;
      return null;
    }
    renderToString(React.createElement(Component));
    expect(handler).toBeDefined();
    handler?.();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
