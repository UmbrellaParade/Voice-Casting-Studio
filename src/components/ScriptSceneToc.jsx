import React, { useEffect, useMemo, useState } from "react";
import { ListTree } from "lucide-react";

const safeDomIdPart = (value = "") => String(value || "scene")
  .normalize("NFKC")
  .replace(/[^a-zA-Z0-9_-]+/g, "-")
  .replace(/^-+|-+$/g, "") || "scene";

export const getScriptSceneAnchorId = (scopeId, sceneId) =>
  `script-scene-${safeDomIdPart(scopeId)}-${safeDomIdPart(sceneId)}`;

const getSceneId = (scene) => scene?.sceneId || scene?.id || "";

const getDialogueCount = (scene) => (scene?.lines || [])
  .filter((line) => !line.isContext && line.kind !== "direction")
  .length;

export function ScriptSceneToc({ scenes = [], scopeId = "script" }) {
  const visibleScenes = useMemo(
    () => scenes.filter((scene) => getSceneId(scene)),
    [scenes]
  );
  const signature = visibleScenes.map((scene) => getSceneId(scene)).join("|");
  const [activeSceneId, setActiveSceneId] = useState(() => getSceneId(visibleScenes[0]));

  useEffect(() => {
    setActiveSceneId(getSceneId(visibleScenes[0]));
  }, [scopeId, signature]);

  if (visibleScenes.length < 2) return null;

  const jumpToScene = (sceneId) => {
    setActiveSceneId(sceneId);
    document.getElementById(getScriptSceneAnchorId(scopeId, sceneId))?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  };

  return (
    <nav className="script-scene-toc" aria-label="章内のシーン目次">
      <div className="script-scene-toc-heading">
        <ListTree size={17} />
        <span>シーン目次</span>
      </div>
      <div className="script-scene-toc-list">
        {visibleScenes.map((scene, index) => {
          const sceneId = getSceneId(scene);
          return (
            <button
              type="button"
              key={sceneId}
              className={activeSceneId === sceneId ? "active" : ""}
              onClick={() => jumpToScene(sceneId)}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{scene.title || `Scene ${index + 1}`}</strong>
              <small>{getDialogueCount(scene)}セリフ</small>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
