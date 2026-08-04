/// <reference types="astro/client" />

interface Window {
  showInteractivo?: {
    observeReveals(root?: ParentNode): void;
  };
}
