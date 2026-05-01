import React, { useState } from "react";
import { sendWs } from "./store";

export function PauseControl() {
  const [paused, setPaused] = useState(false);

  function toggle() {
    const next = !paused;
    sendWs({ kind: next ? "PAUSE" : "RESUME" });
    setPaused(next);
  }

  return (
    <button
      onClick={toggle}
      title={paused ? "Resume world" : "Pause world"}
      style={{
        background: paused ? "rgba(255,200,80,0.18)" : "rgba(255,255,255,0.06)",
        border: `1px solid ${paused ? "rgba(255,200,80,0.45)" : "rgba(255,255,255,0.13)"}`,
        borderRadius: 5,
        color: paused ? "#ffe680" : "#9a8a70",
        fontFamily: "'VT323', monospace",
        fontSize: 14,
        padding: "2px 10px",
        cursor: "pointer",
        letterSpacing: 0.5,
        userSelect: "none",
      }}
    >
      {paused ? "▶ resume" : "⏸ pause"}
    </button>
  );
}
