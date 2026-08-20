import { ASSET_BASE_PATH, GAME_CONFIG, SPRITE_MANIFEST_PATH } from "./config";
import type { CharacterId, MovementSpriteManifest } from "./types";

export interface LoadedCharacterAssets {
  manifest: MovementSpriteManifest;
  images: Record<CharacterId, HTMLImageElement>;
  enemyImage: HTMLImageElement;
  enemyArrestedImage: HTMLImageElement;
  droneImage: HTMLImageElement;
  cloudImage: HTMLImageElement | null;
  mapImage: HTMLImageElement | null;
  objectImages: Record<string, HTMLImageElement>;
}

export interface LoadCharacterAssetsOptions {
  mapImagePath?: string;
  objectImagePaths?: string[];
}

export class AssetLoader {
  private manifestPromise: Promise<MovementSpriteManifest> | null = null;
  private imagePromises = new Map<string, Promise<HTMLImageElement>>();

  async loadCharacterAssets(
    options: LoadCharacterAssetsOptions = {}
  ): Promise<LoadedCharacterAssets> {
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

    const objectImagePaths = [...new Set(options.objectImagePaths ?? [])];
    const objectImageEntries = await Promise.all(
      objectImagePaths.map(async (path) => {
        const image = await this.loadImage(`object:${path}`, path);
        return [path, image] as const;
      })
    );

    return {
      manifest,
      images: Object.fromEntries(imageEntries) as Record<CharacterId, HTMLImageElement>,
      enemyImage: await this.loadImage(
        "enemy",
        `${ASSET_BASE_PATH}${GAME_CONFIG.enemy.sprite.file}`
      ),
      enemyArrestedImage: await this.loadImage(
        "enemy-arrested",
        `${ASSET_BASE_PATH}${GAME_CONFIG.enemy.sprite.arrestedFile}`
      ),
      droneImage: await this.loadImage(
        "drone",
        `${ASSET_BASE_PATH}${GAME_CONFIG.drone.sprite.file}`
      ),
      cloudImage: await this.loadOptionalImage("cloud", GAME_CONFIG.cloud.sprite.file),
      mapImage: options.mapImagePath
        ? await this.loadOptionalImage(`map:${options.mapImagePath}`, options.mapImagePath)
        : null,
      objectImages: Object.fromEntries(objectImageEntries)
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

  private async loadOptionalImage(
    cacheKey: string,
    path: string
  ): Promise<HTMLImageElement | null> {
    try {
      return await this.loadImage(cacheKey, path);
    } catch (error) {
      console.warn("Optional image not loaded.", {
        cacheKey,
        path,
        error
      });
      return null;
    }
  }
}
