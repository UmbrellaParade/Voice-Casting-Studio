import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { FileAudio, Play, Square } from "lucide-react";
import {
  getGoogleDriveFileId,
  makeDirectAudioDownloadUrl,
  makeGoogleDrivePreviewUrl
} from "../lib/core.js";

const PersistentAudioContext = createContext(null);

const getPlaybackUrl = (url = "") => {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  return getGoogleDriveFileId(trimmed) ? makeDirectAudioDownloadUrl(trimmed) : trimmed;
};

export function PersistentAudioProvider({ children }) {
  const [track, setTrack] = useState(null);
  const play = useCallback((nextTrack) => {
    if (!String(nextTrack?.url || "").trim()) return;
    setTrack({
      id: String(nextTrack.id || nextTrack.url),
      title: String(nextTrack.title || "音声素材"),
      category: String(nextTrack.category || "素材"),
      url: String(nextTrack.url).trim()
    });
  }, []);
  const stop = useCallback(() => setTrack(null), []);
  const value = useMemo(() => ({ track, play, stop }), [track, play, stop]);
  const drivePreviewUrl = track ? makeGoogleDrivePreviewUrl(track.url) : "";

  return (
    <PersistentAudioContext.Provider value={value}>
      {children}
      {track && (
        <aside className="persistent-audio-dock" aria-label="再生中の素材">
          <div className="persistent-audio-meta">
            <FileAudio size={18} />
            <span><small>{track.category}</small><b>{track.title}</b></span>
          </div>
          {drivePreviewUrl ? (
            <iframe
              key={track.id}
              title={`${track.title}を再生`}
              src={drivePreviewUrl}
              allow="autoplay"
            />
          ) : (
            <audio
              key={track.id}
              controls
              autoPlay
              preload="metadata"
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              src={getPlaybackUrl(track.url)}
            />
          )}
          <button type="button" className="persistent-audio-stop" onClick={stop} title="再生を停止" aria-label="再生を停止">
            <Square size={16} />
          </button>
        </aside>
      )}
    </PersistentAudioContext.Provider>
  );
}

export function PersistentAudioButton({ material, className = "secondary material-play-button" }) {
  const context = useContext(PersistentAudioContext);
  if (!context) throw new Error("PersistentAudioButton must be used inside PersistentAudioProvider.");
  const isCurrent = Boolean(context.track && context.track.id === String(material.id || material.url));
  if (!material.url) return <span className="production-empty-media"><FileAudio size={16} />音声URL未登録</span>;

  return (
    <button
      type="button"
      className={`${className}${isCurrent ? " active" : ""}`}
      onClick={() => context.play(material)}
      aria-pressed={isCurrent}
    >
      <Play size={16} fill="currentColor" />
      {isCurrent ? "再生中" : "再生"}
    </button>
  );
}
