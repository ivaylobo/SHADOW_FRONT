import { ASSET_BASE_PATH, SPRITE_MANIFEST_PATH } from "./config";
import type { CharacterId, MovementSpriteManifest } from "./types";

export interface LoadedCharacterAssets {
  manifest: MovementSpriteManifest;
  images: Record<CharacterId, HTMLImageElement>;
  enemyImage: HTMLImageElement;
}

export class AssetLoader {
  private manifestPromise: Promise<MovementSpriteManifest> | null = null;
  private imagePromises = new Map<string, Promise<HTMLImageElement>>();

  async loadCharacterAssets(): Promise<LoadedCharacterAssets> {
    const manifest = await this.loadManifest();
    const entries = Object.entries(manifest.files) as [
      CharacterId,
      MovementSpriteManifest["files"][CharacterId]
    ][];
    const imageEntries = await Promise.all(
      entries.map(async ([characterId, fileInfo]) => {
        const image = await this.loadImage(characterId, `${ASSET_BASE_PATH}${fileInfo.file}`);
        return [characterId, image] as const;
      })
    );

    return {
      manifest,
      images: Object.fromEntries(imageEntries) as Record<CharacterId, HTMLImageElement>,
      enemyImage: await this.loadImage(
        "enemy",
        `${ASSET_BASE_PATH}enemy_movement_8dir_6frames_v5_matched_to_alyosha.png`
      )
    };
  }

  private async loadManifest(): Promise<MovementSpriteManifest> {
    if (!this.manifestPromise) {
      this.manifestPromise = fetch(SPRITE_MANIFEST_PATH).then(async (response) => {
        if (!response.ok) {
          throw new Error(`Cannot load sprite manifest: ${response.status}`);
        }

        return (await response.json()) as MovementSpriteManifest;
      });
    }

    return this.manifestPromise;
  }

  private loadImage(cacheKey: string, path: string): Promise<HTMLImageElement> {
    const cached = this.imagePromises.get(cacheKey);
    if (cached) {
      return cached;
    }

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Cannot load image: ${path}`));
      image.src = path;
    });

    this.imagePromises.set(cacheKey, promise);
    return promise;
  }
}
