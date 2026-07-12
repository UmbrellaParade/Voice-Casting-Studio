const parseGasResult = async (response) => {
  const text = await response.text();
  let result = null;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error("受信口の応答を読み取れませんでした。Apps Scriptのデプロイ設定を確認してください。");
  }
  if (!response.ok || !result || result.ok !== true) {
    throw new Error(result?.error || `受信口がエラーを返しました（HTTP ${response.status}）。`);
  }
  return result;
};

export const postToGasEndpoint = async (endpointUrl, payload) => {
  const response = await fetch(String(endpointUrl).trim(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    redirect: "follow"
  });
  return parseGasResult(response);
};

export const getFromGasEndpoint = async (endpointUrl, params = {}) => {
  const url = new URL(String(endpointUrl).trim());
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  });
  const response = await fetch(url.toString(), { redirect: "follow", cache: "no-store" });
  return parseGasResult(response);
};

export const loadAppConfig = async (baseUrl = "/") => {
  try {
    const response = await fetch(`${baseUrl}app-config.json`, { cache: "no-store" });
    if (!response.ok) return {};
    return await response.json();
  } catch {
    return {};
  }
};
