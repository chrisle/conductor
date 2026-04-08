import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useLayoutStore, type LayoutNode } from "@/store/layout";
import { useTabsStore } from "@/store/tabs";
import ActivityBar from "../ActivityBar";
import Sidebar from "../Sidebar";
import SplitPane from "./SplitPane";
import SettingsDialog from "../SettingsDialog";

const DRAGGING_TAB_KEY = "__dragging_tab__";
const DRAGGING_GROUP_KEY = "__dragging_group__";

function EdgeDropZone({ side, dragging }: { side: "west" | "east" | "north" | "south"; dragging: boolean }) {
  const [active, setActive] = useState(false);

  const isHorizontal = side === "north" || side === "south";

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setActive(true);
    e.dataTransfer.dropEffect = "move";
  }

  function handleDragLeave() {
    setActive(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setActive(false);

    const tabId = e.dataTransfer.getData(DRAGGING_TAB_KEY);
    const sourceGroupId = e.dataTransfer.getData(DRAGGING_GROUP_KEY);
    if (!tabId) return;

    const newGroupId = useTabsStore.getState().createGroup();
    useLayoutStore.getState().insertAtEdge(side, newGroupId);
    useTabsStore.getState().moveTab(sourceGroupId, tabId, newGroupId);

    setTimeout(() => {
      const src = useTabsStore.getState().groups[sourceGroupId];
      if (src && src.tabs.length === 0) {
        useLayoutStore.getState().removeGroup(sourceGroupId);
        useTabsStore.getState().removeGroup(sourceGroupId);
      }
    }, 0);
  }

  return (
    <div
      className={cn(
        "absolute z-20 transition-all",
        // Invisible to clicks until a tab drag begins
        dragging ? "pointer-events-auto" : "pointer-events-none",
        // Horizontal edges span full width at top/bottom
        isHorizontal && "left-0 right-0 h-4",
        side === "north" && "top-0",
        side === "south" && "bottom-0",
        isHorizontal && active && "h-8",
        // Vertical edges span full height at left/right
        !isHorizontal && "top-0 bottom-0 w-4",
        side === "west" && "left-0",
        side === "east" && "right-0",
        !isHorizontal && active && "w-8"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {active && (
        <div
          className={cn(
            "absolute bg-blue-500",
            // Horizontal indicator: thin line spanning full width
            isHorizontal && "inset-x-0 h-1",
            side === "north" && "top-0",
            side === "south" && "bottom-0",
            // Vertical indicator: thin line spanning full height
            !isHorizontal && "inset-y-0 w-1",
            side === "west" && "left-0",
            side === "east" && "right-0"
          )}
        />
      )}
    </div>
  );
}

export default function MainLayout(): React.ReactElement {
  const root = useLayoutStore(s => s.root);
  const initialized = useRef(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Only create an initial group if no layout has been restored yet.
    // Project initialization (initializeDefaultProject) runs after this
    // effect and will set its own layout; if a layout already exists
    // (e.g. from a fast restore), skip to avoid creating orphan groups.
    if (useLayoutStore.getState().root) return;

    const groupId = useTabsStore.getState().createGroup();
    useLayoutStore.getState().setRoot({ type: "leaf", groupId });
    useLayoutStore.getState().setFocusedGroup(groupId);
  }, []);

  // Enable edge drop zones only while a tab drag is in progress so
  // they don't block clicks on the toolbar beneath them (CON-65).
  useEffect(() => {
    const onStart = () => setDragging(true);
    const onEnd = () => setDragging(false);
    window.addEventListener("dragstart", onStart);
    window.addEventListener("dragend", onEnd);
    // "dragend" doesn't fire when the dragged element is removed from the DOM
    // before the drag finishes (e.g. moving the last tab out of a group destroys
    // the source group mid-drag). Capture-phase "drop" fires before any handler
    // calls stopPropagation, so it reliably resets the dragging state.
    window.addEventListener("drop", onEnd, true);
    return () => {
      window.removeEventListener("dragstart", onStart);
      window.removeEventListener("dragend", onEnd);
      window.removeEventListener("drop", onEnd, true);
    };
  }, []);

  if (!root) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-600">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden">
      <ActivityBar />
      <Sidebar defaultGroupId={getFirstGroupId(root)} />
      <div className="flex-1 min-w-0 overflow-hidden relative">
        <EdgeDropZone side="north" dragging={dragging} />
        <EdgeDropZone side="west" dragging={dragging} />
        <SplitPane node={root} />
        <EdgeDropZone side="east" dragging={dragging} />
        <EdgeDropZone side="south" dragging={dragging} />
      </div>
      <SettingsDialog />
    </div>
  );
}

function getFirstGroupId(
  node: ReturnType<typeof useLayoutStore.getState>["root"],
): string {
  if (!node) return "";
  if (node.type === "leaf") return node.groupId;
  return getFirstGroupId(node.children[0]?.node ?? null);
}
