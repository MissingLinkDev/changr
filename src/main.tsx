import OBR, { type Image, isImage, type Permission } from "@owlbear-rodeo/sdk";
import {
  addImageOption,
  getImageOptions,
  isImageOption,
  isPlainObject,
  isPlayerGM,
  updateImageButtons,
  updateItemWithImageOption,
  type ImageOption,
} from "./helpers";
import "./styles.css";
import { getPluginId } from "./getPluginId";
import SimpleBar from 'simplebar';
import 'simplebar/dist/simplebar.min.css';

/**
 * This file represents the HTML of the popover that is shown once
 * the status ring context menu item is clicked.
 */

/**
 * Check if the player has create permissions for a specific layer
 */
async function hasLayerCreatePermission(layer: string): Promise<boolean> {
  const createPermission = `${layer}_CREATE` as Permission;
  const hasPermission = await OBR.player.hasPermission(createPermission);
  return hasPermission;
}

/**
 * Check if the player can add image options (either GM or has create permissions for the item's layer)
 */
async function canAddImageOptions(): Promise<boolean> {

  // First check if player is GM
  const isGM = await isPlayerGM();
  if (isGM) {
    return true;
  }

  // Check if player has create permissions for the selected item's layer
  const selection = await OBR.player.getSelection();
  if (!selection || selection.length === 0) {
    return false;
  }

  const items = await OBR.scene.items.getItems<Image>([selection[0]]);
  if (items.length === 0 || !isImage(items[0])) {
    return false;
  }

  const selectedItem = items[0];
  const hasPermission = await hasLayerCreatePermission(selectedItem.layer);
  return hasPermission;
}

/**
 * Setup the image options panel with buttons and event listeners
 */
async function setupPanel(imageOptions: ImageOption[], showAddButton: boolean): Promise<void> {

  // Setup the document with the image buttons
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <div class="scroll-container">
      <div class="image-options">
        ${imageOptions
      .map(
        (option) => {
          const isVideo = option.mime?.startsWith('video/') ||
            option.url.toLowerCase().match(/\.(webm|mp4|mov|avi|mkv|ogv)$/);
          return `
                  <button class="image-button" id="${option.id}" title="${option.name}">
                    ${isVideo
              ? `<video class="image-thumbnail" src="${option.url}" muted preload="metadata"></video>`
              : `<img class="image-thumbnail" src="${option.url}" alt="${option.name}" />`
            }
                  </button>
                  `;
        }
      )
      .join("")}
        ${showAddButton ? `
          <button class="add-button" id="add-image-option" title="Add new image option">
            <div class="add-icon">+</div>
          </button>
        ` : ''}
      </div>
    </div>
  `;
  // Initialize SimpleBar on the scroll container
  const scrollContainer = document.querySelector('.scroll-container') as HTMLElement;
  if (scrollContainer) {
    new SimpleBar(scrollContainer, {
      autoHide: true,
      scrollbarMinSize: 20,
      scrollbarMaxSize: 20,
    });
  }

  // Attach click listeners to image buttons
  document
    .querySelectorAll<HTMLButtonElement>(".image-button")
    .forEach((button) => {
      button.addEventListener("click", () => {
        handleImageButtonClick(button);
      });
      button.addEventListener("contextmenu", (event) => {
        handleImageButtonRightClick(button, event);
      });
    });

  // Attach click listener to add button (only if shown)
  if (showAddButton) {
    document
      .querySelector<HTMLButtonElement>(".add-button")
      ?.addEventListener("click", () => {
        handleAddButtonClick();
      });
  }

  // Update the button states with the current selection
  await updateImageButtons(imageOptions);
}

/**
 * Refresh the entire UI based on current permissions and selection
 */
async function refreshUI(): Promise<void> {
  try {
    const imageOptions = await getImageOptions();
    const showAddButton = await canAddImageOptions();
    await setupPanel(imageOptions, showAddButton);
  } catch (error) {
    console.error("Error refreshing UI:", error);
  }
}

OBR.onReady(async () => {

  // Get the image options for the selected item
  const imageOptions = await getImageOptions();

  // Check if add button should be shown
  const showAddButton = await canAddImageOptions();

  // Setup the panel
  await setupPanel(imageOptions, showAddButton);

  // Add change listener for player permissions
  OBR.player.onChange(async () => {
    await refreshUI();
  });

  // Add change listener for updating button states and permissions
  OBR.scene.items.onChange(async () => {
    const updatedImageOptions = await getImageOptions();
    await updateImageButtons(updatedImageOptions);

    // Also check if add button visibility should change
    const showAddButton = await canAddImageOptions();
    const currentAddButton = document.querySelector('.add-button');
    const shouldHaveAddButton = showAddButton;

    // If the add button state changed, refresh the entire UI
    if ((currentAddButton && !shouldHaveAddButton) || (!currentAddButton && shouldHaveAddButton)) {
      await refreshUI();
    }
  });
});

async function handleImageButtonClick(button: HTMLButtonElement) {

  // Find the image option that matches this button
  const imageOptions = await getImageOptions();
  const selectedOption = imageOptions.find(option => option.id === button.id);

  if (selectedOption) {
    await updateItemWithImageOption(selectedOption);

    // Update button states to reflect the new selection
    await updateImageButtons(imageOptions);
  } else {
    console.log("Could not find image option for button:", button.id);
  }
}

async function handleAddButtonClick() {

  try {
    // Get the currently selected item to determine its asset type
    const selection = await OBR.player.getSelection();

    if (!selection || selection.length === 0) {
      return;
    }

    const items = await OBR.scene.items.getItems<Image>([selection[0]]);

    if (items.length === 0 || !isImage(items[0])) {
      return;
    }

    const selectedItem = items[0];

    // Determine the asset type based on the item's layer
    let assetType: "CHARACTER" | "PROP" | "MOUNT" | "ATTACHMENT" | "NOTE" | "MAP";
    switch (selectedItem.layer) {
      case "CHARACTER":
        assetType = "CHARACTER";
        break;
      case "PROP":
        assetType = "PROP";
        break;
      case "MOUNT":
        assetType = "MOUNT";
        break;
      case "ATTACHMENT":
        assetType = "ATTACHMENT";
        break;
      case "NOTE":
        assetType = "NOTE";
        break;
      case "MAP":
        assetType = "MAP";
        break;
      default:
        assetType = "PROP"; // Default fallback
    }

    // Open image picker dialog
    const downloadResult = await OBR.assets.downloadImages(false, undefined, assetType);

    if (downloadResult && downloadResult.length > 0) {
      // Add the new image option to metadata
      await addImageOption(downloadResult[0]);
      // Refresh the UI with updated image options
      await refreshUI();
    } else {
      console.log("No image selected or download cancelled");
    }
  } catch (error) {
    console.error("Error adding image option:", error);
  }
}

async function handleImageButtonRightClick(button: HTMLButtonElement, event: MouseEvent) {
  event.preventDefault();

  // Find the image option that matches this button
  const imageOptions = await getImageOptions();
  const selectedOption = imageOptions.find(option => option.id === button.id);

  if (!selectedOption) return;

  // Check if this is the currently selected image (disable removal if so)
  const selection = await OBR.player.getSelection();
  if (!selection || selection.length === 0) return;

  const items = await OBR.scene.items.getItems<Image>([selection[0]]);
  if (items.length === 0 || !isImage(items[0])) return;

  const selectedItem = items[0];
  const isCurrentImage = selectedItem.image.url === selectedOption.url;

  if (isCurrentImage) {
    return;
  }

  // Confirm removal
  if (confirm(`Remove "${selectedOption.name}" from image options?`)) {
    await removeImageOption(selectedOption.id);

    // Refresh the UI
    await refreshImageOptionsUI();
  }
}

async function removeImageOption(optionId: string): Promise<void> {
  const selection = await OBR.player.getSelection();
  if (!selection || selection.length === 0) return;

  await OBR.scene.items.updateItems(
    (item) => selection.includes(item.id) && isImage(item),
    (items) => {
      for (const item of items) {
        const currentMetadata = item.metadata[getPluginId("metadata")];
        if (isPlainObject(currentMetadata) && Array.isArray(currentMetadata.imageOptions)) {
          const filteredOptions = currentMetadata.imageOptions.filter((option: any) =>
            !isImageOption(option) || option.id !== optionId
          );

          const metadataBase = isPlainObject(currentMetadata) ? currentMetadata : {};
          item.metadata[getPluginId("metadata")] = {
            ...metadataBase,
            imageOptions: filteredOptions
          };
        }
      }
    }
  );
}

async function refreshImageOptionsUI(): Promise<void> {
  await refreshUI();
}