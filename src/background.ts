import OBR from "@owlbear-rodeo/sdk";
import { getPluginId } from "./getPluginId";

// Wait for the SDK to be ready
OBR.onReady(async () => {
    // Set up the context menu for image items
    await OBR.contextMenu.create({
        id: getPluginId("menu"),
        icons: [
            {
                icon: "/icon.svg",
                label: "Change Image",
                filter: {
                    every: [{ key: "type", value: "IMAGE" }],
                    permissions: ["UPDATE"]
                }
            }
        ],
        embed: {
            url: "/",
            height: 124,
        }
    });
});