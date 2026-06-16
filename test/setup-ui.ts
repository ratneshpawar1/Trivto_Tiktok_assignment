// Extends `expect` with @testing-library/jest-dom matchers (toBeInTheDocument,
// toHaveAttribute, etc.). Harmless for node-env tests that don't use them.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// jsdom has no IntersectionObserver. Provide a no-op default so any component
// effect that constructs one never throws (even if a passive effect flushes
// during teardown). Tests that need to drive it replace globalThis.IntersectionObserver.
if (!("IntersectionObserver" in globalThis)) {
  class NoopIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  // @ts-expect-error jsdom test shim
  globalThis.IntersectionObserver = NoopIntersectionObserver;
}

// Unmount React trees between tests so the DOM and effects don't leak.
afterEach(() => {
  cleanup();
});
