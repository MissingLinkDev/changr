import OBR, { type Image, isImage } from "@owlbear-rodeo/sdk";
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
 * Setup the image options panel with buttons and event listeners
 */
async function setupPanel(imageOptions: ImageOption[], isGM: boolean): Promise<void> {
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
        ${isGM ? `
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

  // Attach click listener to add button (only if GM)
  if (isGM) {
    document
      .querySelector<HTMLButtonElement>(".add-button")
      ?.addEventListener("click", () => {
        handleAddButtonClick();
      });
  }

  // Update the button states with the current selection
  await updateImageButtons(imageOptions);
}

OBR.onReady(async () => {
  // Check if player is GM - only GMs can use this extension
  const isGM = await isPlayerGM();
  // Get the image options for the selected item
  const imageOptions = await getImageOptions();

  // Setup the panel
  await setupPanel(imageOptions, isGM);

  // Add change listener for updating button states
  OBR.scene.items.onChange(async () => {
    const updatedImageOptions = await getImageOptions();
    updateImageButtons(updatedImageOptions);
  });
});

async function handleImageButtonClick(button: HTMLButtonElement) {
  console.log("Image button clicked:", button.id);

  // Find the image option that matches this button
  const imageOptions = await getImageOptions();
  const selectedOption = imageOptions.find(option => option.id === button.id);

  if (selectedOption) {
    console.log("Switching to image option:", selectedOption);
    await updateItemWithImageOption(selectedOption);

    // Update button states to reflect the new selection
    await updateImageButtons(imageOptions);
  } else {
    console.log("Could not find image option for button:", button.id);
  }
}

async function handleAddButtonClick() {
  console.log("Add button clicked");

  try {
    // Get the currently selected item to determine its asset type
    const selection = await OBR.player.getSelection();
    console.log("Selection:", selection);

    if (!selection || selection.length === 0) {
      console.log("No item selected");
      return;
    }

    const items = await OBR.scene.items.getItems<Image>([selection[0]]);
    console.log("Selected items:", items);

    if (items.length === 0 || !isImage(items[0])) {
      console.log("Selected item is not an image");
      return;
    }

    const selectedItem = items[0];
    console.log("Selected item details:", selectedItem);

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

    console.log("Determined asset type:", assetType);

    // Open image picker dialog
    console.log("Opening image picker...");
    const downloadResult = await OBR.assets.downloadImages(false, undefined, assetType);
    console.log("Download result:", downloadResult);

    if (downloadResult && downloadResult.length > 0) {
      console.log("Image selected, adding to metadata...");

      // Add the new image option to metadata
      await addImageOption(downloadResult[0]);
      console.log("Image option added successfully");

      // Refresh the UI with updated image options
      const updatedImageOptions = await getImageOptions();
      console.log("Updated image options:", updatedImageOptions);

      // Check if player is GM to determine if add button should be shown
      const isGM = await isPlayerGM();

      // Refresh the panel
      console.log("Refreshing UI...");
      await setupPanel(updatedImageOptions, isGM);
      console.log("UI refresh complete");
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
    console.log("Cannot remove currently selected image");
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
  const updatedImageOptions = await getImageOptions();
  const isGM = await isPlayerGM();

  // Use the setupPanel function to refresh the UI
  await setupPanel(updatedImageOptions, isGM);
}