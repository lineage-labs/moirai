import React from "react";
import { motion } from "framer-motion";

export function LionTargetRing() {
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }}
    >
      <motion.div
        aria-hidden="true"
        animate={{ scale: [0.92, 1.08, 0.92], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: 54,
          height: 22,
          border: "3px solid rgba(255, 45, 45, 0.9)",
          borderRadius: "50%",
          boxShadow: "0 0 14px rgba(255,45,45,0.75), inset 0 0 8px rgba(255,45,45,0.28)",
        }}
      />
    </div>
  );
}
