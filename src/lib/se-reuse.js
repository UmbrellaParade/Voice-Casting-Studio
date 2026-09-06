const normalizeText = (value = "") => String(value || "")
  .normalize("NFKC")
  .toLocaleLowerCase("ja")
  .replace(/[\s\u3000]+/gu, "")
  .replace(/[、。．,.!！?？「」『』【】（）()\[\]・…―ー～~]/gu, "")
  .trim();

const has = (text, pattern) => pattern.test(text);

const addFamily = (families, key, label) => {
  if (!families.some((family) => family.key === key)) families.push({ key, label });
};

const inferSoundFamilies = (title = "") => {
  const text = normalizeText(title);
  const families = [];

  const hasRain = has(text, /雨|土砂降り|雨粒|雨音/u);
  const hasFootsteps = has(text, /足音|歩き出|歩いて|歩く|踏み出|後ずさ|近づく|走る音/u);
  const hasUmbrellaRain = hasRain && has(text, /傘/u);
  const hasRoofRain = hasRain && has(text, /屋根|トタン/u);
  const hasWetFootsteps = hasFootsteps && (hasRain || has(text, /水たまり|泥水/u));

  if (hasUmbrellaRain) addFamily(families, "umbrella-rain", "傘を叩く雨音");
  else if (hasRoofRain) addFamily(families, "roof-rain", "屋根を叩く雨音");
  else if (hasWetFootsteps) addFamily(families, "wet-footsteps", "雨・水たまりの足音");
  else if (hasRain) addFamily(families, "rain", "雨音");

  if (has(text, /雷|雷鳴/u)) addFamily(families, "thunder", "雷鳴");
  if (hasFootsteps && !hasWetFootsteps) {
    addFamily(families, has(text, /ヒール/u) ? "heel-footsteps" : "footsteps", has(text, /ヒール/u) ? "ヒールの足音" : "足音");
  }
  if (has(text, /拍手/u)) addFamily(families, "applause", "拍手");
  if (has(text, /歓声/u)) addFamily(families, "cheers", "歓声");
  if (has(text, /ざわめき/u)) addFamily(families, "crowd", "観客のざわめき");

  if (has(text, /マイクスタンド/u)) {
    if (has(text, /こする|擦る|引きず/u)) addFamily(families, "mic-stand-scrape", "マイクスタンドを床でこする音");
    else if (has(text, /叩きつけ|突き立て|置く|置かれ|倒す|床に触れ|地面に/u)) addFamily(families, "mic-stand-impact", "マイクスタンドを床へ置く・打つ音");
    else if (has(text, /握/u)) addFamily(families, "mic-stand-grip", "マイクスタンドを握る金属音");
    else if (has(text, /振|掲げ|構え|持ち上げ|拾い上げ|肩に担/u)) addFamily(families, "mic-stand-move", "マイクスタンドを動かす音");
    else addFamily(families, "mic-stand", "マイクスタンドの金属音");
  } else if (has(text, /マイクのノイズ|アナウンス用マイク/u)) {
    addFamily(families, "microphone-noise", "マイク・会場アナウンスのノイズ");
  }

  if (has(text, /息を呑|息が止ま|息を止め/u)) addFamily(families, "gasp", "息を呑む・息が止まる音");
  else if (has(text, /息を吐/u)) addFamily(families, "exhale", "息を吐く音");
  else if (has(text, /呼吸|息を切ら|息を整え|息を押し殺/u)) addFamily(families, "breathing", "呼吸音");

  const doorText = text.replace(/フェー?ドアウト/gu, "");
  if (has(doorText, /扉|ドア/u)) {
    if (has(doorText, /叩く/u)) addFamily(families, "door-knock", "扉を叩く音");
    else if (has(doorText, /ロック|鍵/u)) addFamily(families, "door-lock", "扉のロック・鍵の音");
    else if (has(doorText, /開/u)) addFamily(families, "door-open", "扉が開く音");
    else if (has(doorText, /閉/u)) addFamily(families, "door-close", "扉が閉まる音");
    else addFamily(families, "door", "扉の音");
  }

  if (has(text, /風/u)) addFamily(families, "wind", "風音");
  if (has(text, /ノイズ/u) && !families.some((family) => family.key === "microphone-noise")) addFamily(families, "noise", "ノイズ");
  if (has(text, /鐘|ベル/u)) addFamily(families, "bell", "鐘・ベル");
  if (has(text, /ガラス/u)) addFamily(families, "glass", "ガラス音");
  if (has(text, /銃|発砲/u)) addFamily(families, "gunshot", "銃声");
  if (has(text, /爆発|爆ぜ/u)) addFamily(families, "explosion", "爆発音");
  if (has(text, /炎|燃える|火を/u)) addFamily(families, "fire", "炎・火の音");
  if (has(text, /剣|刀|刃/u)) addFamily(families, "blade", "剣・刃の音");
  if (has(text, /杖/u)) addFamily(families, "cane", "杖の音");
  if (has(text, /椅子/u)) addFamily(families, "chair", "椅子の音");
  if (has(text, /衣擦れ|ストールが揺れ/u)) addFamily(families, "cloth", "衣擦れ・布の音");
  if (has(text, /水滴|排水管|水が滴/u) && !hasWetFootsteps) addFamily(families, "water-drops", "水滴・水の落ちる音");
  if (has(text, /沈黙|少し間|長い間|短い間/u)) addFamily(families, "silence", "無音・間（制作不要候補）");

  return families;
};

const getAutomaticCommonSe = (material = {}) => {
  const families = inferSoundFamilies(material.title);
  if (!families.length) {
    const normalizedTitle = normalizeText(material.title) || String(material.id || "unknown");
    return {
      key: `cue:${normalizedTitle}`,
      name: String(material.title || "名称未設定SE"),
      automatic: false,
      familyKeys: []
    };
  }
  return {
    key: `auto:${families.map((family) => family.key).sort().join("+")}`,
    name: families.map((family) => family.label).join(" + "),
    automatic: true,
    familyKeys: families.map((family) => family.key)
  };
};

const getMaterialLocations = (material = {}) => {
  const locations = Array.isArray(material.locations) ? material.locations : [];
  if (locations.length) return locations;
  if (!material.chapterId && !material.chapterTitle) return [];
  return [{
    chapterId: String(material.chapterId || ""),
    chapterTitle: String(material.chapterTitle || "章未設定"),
    sceneId: "",
    sceneTitle: ""
  }];
};

export const getRequiredMaterialCommonSeInfo = (material = {}) => {
  const manualName = String(material.commonSeName || "").trim();
  if (manualName) {
    return {
      key: `manual:${normalizeText(manualName)}`,
      name: manualName,
      automatic: false,
      manuallyNamed: true,
      familyKeys: []
    };
  }
  return { ...getAutomaticCommonSe(material), manuallyNamed: false };
};

export const groupRequiredMaterialsAsCommonSe = (materials = []) => {
  const groups = new Map();

  (Array.isArray(materials) ? materials : []).forEach((material, materialIndex) => {
    const info = getRequiredMaterialCommonSeInfo(material);
    const current = groups.get(info.key) || {
      id: `common_se_${info.key}`,
      key: info.key,
      title: info.name,
      automatic: info.automatic,
      manuallyNamed: info.manuallyNamed,
      familyKeys: info.familyKeys,
      materials: [],
      locations: [],
      chapterKeys: new Set(),
      locationKeys: new Set(),
      occurrenceCount: 0,
      firstIndex: materialIndex
    };

    current.materials.push(material);
    current.occurrenceCount += Math.max(1, Number(material.occurrenceCount) || 0);
    getMaterialLocations(material).forEach((location) => {
      const chapterKey = String(location.chapterId || location.chapterTitle || "unassigned");
      const locationKey = `${chapterKey}\u0000${location.sceneId || location.sceneTitle || ""}`;
      current.chapterKeys.add(chapterKey);
      if (!current.locationKeys.has(locationKey)) {
        current.locationKeys.add(locationKey);
        current.locations.push(location);
      }
    });
    groups.set(info.key, current);
  });

  return [...groups.values()]
    .sort((left, right) => left.firstIndex - right.firstIndex)
    .map(({ chapterKeys, locationKeys, firstIndex, ...group }) => ({
      ...group,
      chapterCount: chapterKeys.size || 1,
      sourceCount: group.materials.length,
      reductionCount: Math.max(0, group.materials.length - 1),
      reusable: group.materials.length > 1 || group.occurrenceCount > 1
    }));
};
