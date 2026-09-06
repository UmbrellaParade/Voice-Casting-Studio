import React, { useEffect, useState } from "react";
import { Database, Save, LoaderCircle, ExternalLink } from "lucide-react";
import { readGasOwnerConfiguration, saveGasOwnerConfiguration, validateGasOwnerConfiguration } from "../lib/gas-owner.js";
import { postToGasEndpoint } from "../lib/gas.js";

export function GasOwnerConnectionPanel({ settings = {} }) {
  const [values, setValues] = useState(() => readGasOwnerConfiguration(settings) || { endpointUrl: "", token: "", folderUrl: "" });
  const [state, setState] = useState({ busy: false, message: "" });
  const connect = async () => {
    setState({ busy: true, message: "接続を確認しています…" });
    try {
      const config = validateGasOwnerConfiguration(values);
      const result = await postToGasEndpoint(config.endpointUrl, { action: "ownerRequest", operation: "loadWorkspace", token: config.token });
      if (Number(result.protocolVersion) < 3) throw new Error("最新版の統合Code.gsをGASへ反映してください。");
      saveGasOwnerConfiguration(config);
      globalThis.location.reload();
    } catch (error) { setState({ busy: false, message: error.message }); }
  };
  return <section className="panel gas-owner-settings">
    <h3><Database size={18} />GAS制作オーナー接続</h3>
    <div className="form-grid">
      <label className="wide"><span>Apps Script WebアプリURL</span><input type="url" value={values.endpointUrl} onChange={(event) => setValues({ ...values, endpointUrl: event.target.value })} placeholder="https://script.google.com/macros/s/.../exec" /></label>
      <label><span>共同収録のDriveフォルダーURL</span><input type="url" value={values.folderUrl} onChange={(event) => setValues({ ...values, folderUrl: event.target.value })} /></label>
      <label><span>制作オーナーの同期トークン</span><input type="password" autoComplete="off" value={values.token} onChange={(event) => setValues({ ...values, token: event.target.value })} /></label>
    </div>
    <button type="button" className="primary" disabled={state.busy || !values.endpointUrl || !values.token} onClick={connect}>{state.busy ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}接続して開く</button>
    {state.message && <p role="status">{state.message}</p>}
  </section>;
}

export function GasAuditionIntegrationSettings({ settings, onSave, busy }) {
  const [values, setValues] = useState({});
  const [message, setMessage] = useState("");
  useEffect(() => { setValues({ templateFormUrl: settings.templateFormUrl || "", formsFolderUrl: settings.formsFolderUrl || "",
    imageFolderUrl: settings.imageFolderUrl || "", logoUrl: settings.logoUrl || "", audiobookUrl: settings.audiobookUrl || "" }); },
  [settings.templateFormUrl, settings.formsFolderUrl, settings.imageFolderUrl, settings.logoUrl, settings.audiobookUrl]);
  const save = async () => {
    try { await onSave(values); setMessage("このオーナーのGoogle連携を保存しました。"); }
    catch (error) { setMessage(error.message); }
  };
  return <details className="audition-google-setup gas-owner-settings">
    <summary>この作品のフォーム・画像保存先</summary>
    <div className="form-grid">
      {[["templateFormUrl", "見本Googleフォームの編集URL"], ["formsFolderUrl", "作成するフォームの保管フォルダー"], ["imageFolderUrl", "生成画像の保管フォルダー"], ["logoUrl", "作品ロゴの画像URL"], ["audiobookUrl", "参考オーディオブックURL（任意）"]].map(([key, label]) => <label key={key} className="wide"><span>{label}</span><input type="url" value={values[key] || ""} onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></label>)}
    </div>
    <button type="button" className="secondary" disabled={busy || !values.templateFormUrl || !values.formsFolderUrl || !values.imageFolderUrl} onClick={save}><Save size={16} />Google連携を保存</button>
    {values.imageFolderUrl && <a className="secondary" href={values.imageFolderUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} />画像フォルダー</a>}
    {message && <p role="status">{message}</p>}
  </details>;
}
