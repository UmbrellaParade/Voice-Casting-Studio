import test from "node:test";
import assert from "node:assert/strict";
import {
  getRequiredMaterialCommonSeInfo,
  groupRequiredMaterialsAsCommonSe
} from "../src/lib/se-reuse.js";

test("groups reusable SE variants without changing the original materials", () => {
  const materials = [
    {
      id: "rain-soft",
      title: "雨音が少し弱くなる。",
      occurrenceCount: 1,
      locations: [{ chapterId: "chapter-1", chapterTitle: "第一章", sceneId: "scene-1", sceneTitle: "Scene 1" }]
    },
    {
      id: "rain-strong",
      title: "雨音が強くなる。",
      occurrenceCount: 2,
      locations: [{ chapterId: "chapter-2", chapterTitle: "第二章", sceneId: "scene-2", sceneTitle: "Scene 2" }]
    },
    {
      id: "applause",
      title: "大きな拍手。",
      occurrenceCount: 1,
      locations: [{ chapterId: "chapter-2", chapterTitle: "第二章", sceneId: "scene-3", sceneTitle: "Scene 3" }]
    }
  ];
  const snapshot = structuredClone(materials);
  const groups = groupRequiredMaterialsAsCommonSe(materials);
  const rain = groups.find((group) => group.title === "雨音");

  assert.equal(groups.length, 2);
  assert.equal(rain.sourceCount, 2);
  assert.equal(rain.chapterCount, 2);
  assert.equal(rain.occurrenceCount, 3);
  assert.equal(rain.reductionCount, 1);
  assert.equal(rain.reusable, true);
  assert.deepEqual(materials, snapshot);
});

test("keeps compound sounds together and does not mistake fade-out for a door", () => {
  const groups = groupRequiredMaterialsAsCommonSe([
    { id: "fade-a", title: "雨音と歓声が重なり、フェードアウト。" },
    { id: "fade-b", title: "雨音と歓声が重なり、ゆっくりフェードアウト。" },
    { id: "door", title: "大扉が開く。" }
  ]);

  assert.equal(groups.length, 2);
  assert.equal(groups.find((group) => group.title === "雨音 + 歓声").sourceCount, 2);
  assert.equal(groups.find((group) => group.title === "扉が開く音").sourceCount, 1);
});

test("manual common SE names can merge or split automatic groups", () => {
  const groups = groupRequiredMaterialsAsCommonSe([
    { id: "rain-a", title: "雨音。", commonSeName: "屋外の雨ベース" },
    { id: "rain-b", title: "激しい雨。", commonSeName: "屋外の雨ベース" },
    { id: "rain-c", title: "傘を叩く雨音。", commonSeName: "傘用の雨" }
  ]);

  assert.deepEqual(groups.map((group) => [group.title, group.sourceCount]), [
    ["屋外の雨ベース", 2],
    ["傘用の雨", 1]
  ]);
  assert.equal(getRequiredMaterialCommonSeInfo({ title: "遠くの雷。" }).name, "雷鳴");
});

