// Vitest setup: runs once before each test file.
//
// - Loads @testing-library/jest-dom matchers so assertions like
//   expect(el).toBeInTheDocument() work.
// - Mocks window.matchMedia (which jsdom doesn't implement) so any component
//   that calls it during render (Radix, framer-motion, our own useMobile)
//   doesn't blow up. The implementation is deliberately minimal — tests can
//   override it per case if they need a specific breakpoint behavior.
// - Cleans up the DOM after each test via @testing-library/react's
//   automatic cleanup (registered by importing it).
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// jsdom does not implement matchMedia. Several components in this codebase
// call it during render (responsive hooks, theme switchers, Radix internals).
// Default to "desktop"-ish: no match.
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},      // legacy API
      removeListener: () => {},   // legacy API
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// IntersectionObserver / ResizeObserver are commonly used by virtualization
// and observer-driven components; stub minimally so a test rendering a
// virtualized list does not throw.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  // @ts-expect-error - stub class
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  // @ts-expect-error - stub class
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
