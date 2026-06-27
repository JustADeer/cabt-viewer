import type { VisualAssetManifest } from '../lib/game/visualAssets';

class VisualAssetsStore {
  manifest = $state<VisualAssetManifest | undefined>();
  manifestUrl = $state('');
  loading = $state(false);
  error = $state('');
  private loadedUrl = '';

  async loadConfiguredManifest() {
    const url = import.meta.env?.VITE_CABT_VISUAL_ASSET_MANIFEST?.trim();
    if (!url || url === this.loadedUrl) {
      return;
    }
    this.loadedUrl = url;
    this.manifestUrl = url;
    this.loading = true;
    this.error = '';
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      this.manifest = await response.json() as VisualAssetManifest;
    } catch (error) {
      this.manifest = undefined;
      this.error = error instanceof Error ? error.message : String(error);
    } finally {
      this.loading = false;
    }
  }
}

export const visualAssetsStore = new VisualAssetsStore();
