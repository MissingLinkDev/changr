import OBR, { isImage, type Image } from "@owlbear-rodeo/sdk";
import { getPluginId } from "./getPluginId";

export function isPlainObject(
    item: unknown
): item is Record<keyof any, unknown> {
    return (
        item !== null && typeof item === "object" && item.constructor === Object
    );
}

/**
 * Check if the current player is a GM
 */
export async function isPlayerGM(): Promise<boolean> {
    const role = await OBR.player.getRole();
    return role === "GM";
}

export interface ImageOption {
    id: string;
    url: string;
    width: number;
    height: number;
    name: string;
    // Grid settings
    dpi?: number;
    offset?: { x: number; y: number };
    // Transform settings
    rotation?: number;
}

/**
 * Type guard to check if an object is a valid ImageOption
 */
export function isImageOption(obj: unknown): obj is ImageOption {
    return (
        isPlainObject(obj) &&
        typeof obj.id === 'string' &&
        typeof obj.url === 'string' &&
        typeof obj.width === 'number' &&
        typeof obj.height === 'number' &&
        typeof obj.name === 'string' &&
        // Optional properties
        (obj.dpi === undefined || typeof obj.dpi === 'number') &&
        (obj.offset === undefined || (
            isPlainObject(obj.offset) &&
            typeof obj.offset.x === 'number' &&
            typeof obj.offset.y === 'number'
        )) &&
        (obj.rotation === undefined || typeof obj.rotation === 'number')
    );
}

/**
 * Get the list of image options from the selected items' metadata
 * Returns a combined list of all unique image options from selected items
 */
export async function getImageOptions(): Promise<ImageOption[]> {
    const selection = await OBR.player.getSelection();
    if (!selection || selection.length === 0) {
        return [];
    }

    const item = await OBR.scene.items.getItems<Image>([selection[0]]);
    if (item.length === 0 || !isImage(item[0])) {
        return [];
    }

    const selectedItem = item[0];
    const metadata = selectedItem.metadata[getPluginId("metadata")];

    // If metadata exists and has imageOptions, return them
    if (isPlainObject(metadata) && Array.isArray(metadata.imageOptions)) {
        const validOptions: ImageOption[] = [];
        for (const option of metadata.imageOptions) {
            if (isImageOption(option)) {
                validOptions.push(option);
            }
        }
        return validOptions;
    }

    // If no metadata exists, create initial metadata with current image as first option
    const currentImageOption: ImageOption = {
        id: crypto.randomUUID(),
        url: selectedItem.image.url,
        width: selectedItem.image.width,
        height: selectedItem.image.height,
        name: selectedItem.name || "Original Image",
        dpi: selectedItem.grid?.dpi,
        offset: selectedItem.grid?.offset ? { ...selectedItem.grid.offset } : undefined,
        rotation: selectedItem.rotation
    };

    // Save this initial option to the item's metadata
    await OBR.scene.items.updateItems(
        (updateItem) => updateItem.id === selectedItem.id,
        (items) => {
            const currentMetadata = items[0].metadata[getPluginId("metadata")];
            const metadataBase = isPlainObject(currentMetadata) ? currentMetadata : {};
            items[0].metadata[getPluginId("metadata")] = {
                ...metadataBase,
                imageOptions: [currentImageOption]
            };
        }
    );

    return [currentImageOption];
}

/**
 * Add a new image option to the selected items' metadata
 * This function takes an image download object and saves the necessary info
 */
export async function addImageOption(imageDownload: any): Promise<void> {
    console.log("addImageOption called with:", imageDownload);

    const selection = await OBR.player.getSelection();
    if (!selection || selection.length === 0) {
        console.log("No selection in addImageOption");
        return;
    }

    // Create the image option object from the download result structure
    const imageOption: ImageOption = {
        id: crypto.randomUUID(), // Generate unique ID
        url: imageDownload.image.url,
        width: imageDownload.image.width,
        height: imageDownload.image.height,
        name: imageDownload.name || `Image ${Date.now()}`,
        // Capture grid settings from the download
        dpi: imageDownload.grid?.dpi,
        offset: imageDownload.grid?.offset ? { ...imageDownload.grid.offset } : undefined,
        // Initialize rotation to 0 for new images
        rotation: 0
    };

    console.log("Created image option:", imageOption);

    // Update all selected items with the new image option
    await OBR.scene.items.updateItems(
        (item) => selection.includes(item.id) && isImage(item),
        (items) => {
            console.log("Updating items with new image option, items count:", items.length);
            for (const item of items) {
                const currentMetadata = item.metadata[getPluginId("metadata")];
                let imageOptions: ImageOption[] = [];

                // Get existing image options or create new array
                if (isPlainObject(currentMetadata) && Array.isArray(currentMetadata.imageOptions)) {
                    imageOptions = [...currentMetadata.imageOptions];
                }

                // Add the new option if it doesn't already exist
                if (!imageOptions.some(option => option.url === imageOption.url)) {
                    imageOptions.push(imageOption);
                    console.log("Added new image option, total options now:", imageOptions.length);
                } else {
                    console.log("Image option already exists, skipping");
                }

                // Update metadata - ensure we have a valid object to spread
                const metadataBase = isPlainObject(currentMetadata) ? currentMetadata : {};
                item.metadata[getPluginId("metadata")] = {
                    ...metadataBase,
                    imageOptions
                };
            }
        }
    );

    console.log("addImageOption completed");
}

/**
 * Update the selected state of the image buttons based on current selection
 */
export async function updateImageButtons(imageOptions: ImageOption[]) {
    const selection = await OBR.player.getSelection();
    if (!selection || selection.length === 0) {
        // Remove all selected states if no selection
        document.querySelectorAll(".image-button").forEach((element) => {
            element.classList.remove("selected");
        });
        return;
    }

    const items = await OBR.scene.items.getItems<Image>(selection);

    // Remove all previous selected states
    document.querySelectorAll(".image-button").forEach((element) => {
        element.classList.remove("selected");
    });

    // Check which image options are currently being used
    for (const option of imageOptions) {
        const isSelected = items.some(item => {
            if (!isImage(item)) return false;
            return item.image.url === option.url;
        });

        if (isSelected) {
            document.getElementById(option.id)?.classList.add("selected");
        }
    }
}

/**
 * Switch selected items to use a specific image option
 * Applies image, grid settings, and rotation to maintain proper appearance
 */
export async function updateItemWithImageOption(imageOption: ImageOption): Promise<void> {
    const selection = await OBR.player.getSelection();
    if (!selection || selection.length === 0) {
        return;
    }

    OBR.scene.items.updateItems(
        (item) => selection.includes(item.id) && isImage(item),
        (items) => {
            for (const item of items) {
                // Cast to any to work around WritableDraft typing limitations
                const imageItem = item as any;

                // Get current visual dimensions (image size * scale)
                const currentVisualWidth = imageItem.image.width * item.scale.x;
                const currentVisualHeight = imageItem.image.height * item.scale.y;

                // Calculate new scale to maintain the same visual size
                const newScaleX = currentVisualWidth / imageOption.width;
                const newScaleY = currentVisualHeight / imageOption.height;

                // Update the image properties
                imageItem.image.url = imageOption.url;
                imageItem.image.width = imageOption.width;
                imageItem.image.height = imageOption.height;

                // Apply the new scale to maintain visual size
                item.scale = { x: newScaleX, y: newScaleY };

                // Apply grid settings if they exist
                if (imageOption.dpi !== undefined || imageOption.offset !== undefined) {
                    // Initialize grid object if it doesn't exist
                    if (!imageItem.grid) {
                        imageItem.grid = {};
                    }

                    // Apply DPI if specified
                    if (imageOption.dpi !== undefined) {
                        imageItem.grid.dpi = imageOption.dpi;
                    }

                    // Apply offset if specified
                    if (imageOption.offset !== undefined) {
                        imageItem.grid.offset = { ...imageOption.offset };
                    }
                }

                // Apply rotation if specified
                if (imageOption.rotation !== undefined) {
                    item.rotation = imageOption.rotation;
                }

                // Update the name
                item.name = imageOption.name;
            }
        });
}

/**
 * Save the current state of the selected image as a new image option
 * This captures the current rotation and grid settings
 */
export async function saveCurrentImageState(customName?: string): Promise<void> {
    const selection = await OBR.player.getSelection();
    if (!selection || selection.length === 0) {
        return;
    }

    const items = await OBR.scene.items.getItems<Image>([selection[0]]);
    if (items.length === 0 || !isImage(items[0])) {
        return;
    }

    const selectedItem = items[0];

    // Create image option from current state
    const imageOption: ImageOption = {
        id: crypto.randomUUID(),
        url: selectedItem.image.url,
        width: selectedItem.image.width,
        height: selectedItem.image.height,
        name: customName || `${selectedItem.name} (Current State)`,
        dpi: selectedItem.grid?.dpi,
        offset: selectedItem.grid?.offset ? { ...selectedItem.grid.offset } : undefined,
        rotation: selectedItem.rotation
    };

    // Add this state to the metadata
    await OBR.scene.items.updateItems(
        (item) => selection.includes(item.id) && isImage(item),
        (items) => {
            for (const item of items) {
                const currentMetadata = item.metadata[getPluginId("metadata")];
                let imageOptions: ImageOption[] = [];

                // Get existing image options or create new array
                if (isPlainObject(currentMetadata) && Array.isArray(currentMetadata.imageOptions)) {
                    imageOptions = [...currentMetadata.imageOptions];
                }

                // Add the new option (allow duplicates of same URL with different states)
                imageOptions.push(imageOption);

                // Update metadata
                const metadataBase = isPlainObject(currentMetadata) ? currentMetadata : {};
                item.metadata[getPluginId("metadata")] = {
                    ...metadataBase,
                    imageOptions
                };
            }
        }
    );
}