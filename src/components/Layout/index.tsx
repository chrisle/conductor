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
  const { insertAtEdge, removeGroup } = useLayoutStore();
  const { moveTab, createGroup } = useTabsStore();

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

    const newGroupId = createGroup();
    insertAtEdge(side, newGroupId);
    moveTab(sourceGroupId, tabId, newGroupId);

    setTimeout(() => {
      const src = useTabsStore.getState().groups[sourceGroupId];
      if (src && src.tabs.length === 0) {
        removeGroup(sourceGroupId);
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
  const { root, setRoot, setFocusedGroup } = useLayoutStore();
  const { createGroup } = useTabsStore();
  const initialized = useRef(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Create initial group and set layout
    const groupId = createGroup();
    setRoot({ type: "leaf", groupId });
    setFocusedGroup(groupId);
  }, []);

  // Enable edge drop zones only while a tab drag is in progress so
  // they don't block clicks on the toolbar beneath them (CON-65).
  useEffect(() => {
    const onStart = () => setDragging(true);
    const onEnd = () => setDragging(false);
    window.addEventListener("dragstart", onStart);
    window.addEventListener("dragend", onEnd);
    return () => {
      window.removeEventListener("dragstart", onStart);
      window.removeEventListener("dragend", onEnd);
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
