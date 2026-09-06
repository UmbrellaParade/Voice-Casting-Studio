const AUDITION_FINISHER_URL = "http://127.0.0.1:43127";

const requestFinisher = async (path, options = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${AUDITION_FINISHER_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || "PCのフォーム仕上げ処理を完了できませんでした。");
      error.code = payload.code || "audition_finisher_failed";
      error.status = response.status;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("PCのフォーム仕上げ処理が時間内に完了しませんでした。開いたChromeの状態を確認して、もう一度お試しください。");
    }
    if (error instanceof TypeError) {
      const connectionError = new Error("PCフォーム仕上げが起動していません。start-audition-finisher.cmd を一度起動してください。");
      connectionError.code = "audition_finisher_unavailable";
      throw connectionError;
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
};

export const getAuditionFinisherStatus = async () => {
  try {
    const result = await requestFinisher("/health", { method: "GET" }, 2500);
    return { available: true, ...result };
  } catch (error) {
    return { available: false, message: error.message };
  }
};

export const finishAuditionFormOnPc = (payload) => requestFinisher("/finish", {
  method: "POST",
  body: JSON.stringify(payload)
}, 240000);

export const prepareAuditionXPostOnPc = (payload) => requestFinisher("/prepare-x-post", {
  method: "POST",
  body: JSON.stringify(payload)
}, 120000);

export const openAuditionXLoginOnPc = () => requestFinisher("/open-x-login", {
  method: "POST",
  body: "{}"
}, 60000);
