import { useEffect, useRef, useState } from "react";
import { getFromGasEndpoint, postToGasEndpoint } from "../lib/gas.js";
import { GAS_WORKSPACE_PROTOCOL, gasProjectSignature, makeGasPublishedProject } from "../lib/gas-workspace.js";
import { mergeRemoteRecordingProject } from "../lib/recording.js";

export function useGasProjectSync({ data, setData, enabled }) {
  const [state, setState] = useState({ status: "local", message: "" });
  const latest = useRef(data);
  latest.current = data;
  const acknowledged = useRef(new Map());
  const queue = useRef(Promise.resolve());
  const pending = useRef(false);
  const publishRevision = useRef(0);
  const settings = data.settings || {};
  const endpoint = settings.recordingEndpointUrl || settings.responseEndpointUrl;
  const folder = settings.recordingDriveFolderUrl || settings.responseDriveFolderUrl;
  const token = settings.responseSyncToken;
  const ready = Boolean(enabled && endpoint && token);

  useEffect(() => {
    if (!ready) return undefined;
    const revision = ++publishRevision.current;
    pending.current = true;
    const timer = window.setTimeout(() => {
      const snapshot = latest.current;
      queue.current = queue.current.catch(() => undefined).then(async () => {
        if (revision !== publishRevision.current) return;
        for (const project of snapshot.recordingProjects || []) {
          if (revision !== publishRevision.current) return;
          if (!project.sharedAt) continue;
          const published = makeGasPublishedProject(project, snapshot.studioConcept);
          const signature = gasProjectSignature(published);
          const key = `${endpoint}:${folder}:${project.id}`;
          if (acknowledged.current.get(key) === signature) continue;
          setState({ status: "saving", message: "Google Driveへ変更を共有しています…" });
          const result = await postToGasEndpoint(endpoint, {
            action: "publishRecordingProject", token, driveFolderUrl: folder, project: published
          });
          if (result.protocolVersion !== GAS_WORKSPACE_PROTOCOL) throw new Error("GAS受信口を最新版へ更新してください。共有保存はまだ確認できていません。");
          acknowledged.current.set(key, signature);
          if (result.project) setData((current) => ({ ...current,
            recordingProjects: current.recordingProjects.map((item) => item.id === project.id
              ? mergeRemoteRecordingProject(item, result.project) : item)
          }));
        }
        if (revision === publishRevision.current) {
          pending.current = false;
          setState({ status: "ready", message: "Google Driveへ共有済み" });
        }
      }).catch((error) => {
        if (revision !== publishRevision.current) return;
        pending.current = true;
        setState({ status: "error", message: `共有保存できていません: ${error.message} 台本の「配役・共有」から再試行できます。` });
      });
    }, 1100);
    return () => {
      window.clearTimeout(timer);
      if (revision === publishRevision.current) publishRevision.current += 1;
    };
  }, [data, ready, endpoint, folder, token, setData]);

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    const timer = window.setInterval(() => {
      queue.current = queue.current.catch(() => undefined).then(async () => {
        if (pending.current) return;
        for (const project of latest.current.recordingProjects || []) {
          if (!project.sharedAt) continue;
          const result = await getFromGasEndpoint(endpoint, { action: "getRecordingProject", token, folder, projectId: project.id });
          if (cancelled || !result.project) continue;
          if (result.protocolVersion !== GAS_WORKSPACE_PROTOCOL) throw new Error("GAS受信口を最新版へ更新してください。");
          setData((current) => ({ ...current, recordingProjects: current.recordingProjects.map((item) =>
            item.id === project.id ? mergeRemoteRecordingProject(item, result.project) : item) }));
        }
      }).catch((error) => setState({ status: "error", message: `共有状況を取得できません: ${error.message}` }));
    }, 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [ready, endpoint, folder, token, setData]);

  useEffect(() => {
    const warn = (event) => {
      if (!ready || !pending.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [ready]);
  return ready ? state : { status: "local", message: "" };
}
