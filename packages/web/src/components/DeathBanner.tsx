import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getPersonality } from "../personalities";
import { useStore } from "../store";

type BannerState = { name: string; reason: string };

function formatReason(raw: string | undefined): string {
  if (!raw) return "unknown causes";
  const r = raw.toLowerCase();
  if (r.includes("hunger") || r.includes("starvation")) return "hunger";
  if (r.includes("lion"))   return "a lion";
  if (r.includes("fire"))   return "fire";
  if (r.includes("thirst") || r.includes("water")) return "thirst";
  return raw;
}

export function DeathBanner() {
  const events = useStore((s) => s.events);
  const [banner, setBanner] = useState<BannerState | null>(null);
  const lastLenRef = useRef(0);
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const newEvents = events.slice(lastLenRef.current);
    lastLenRef.current = events.length;

    const death = newEvents.find((e) => e.kind === "AGENT_DIED");
    if (!death) return;

    const personality = getPersonality(death.actorId);
    const reason = formatReason((death.payload as { reason?: string })?.reason);

    if (timerRef.current) clearTimeout(timerRef.current);
    setBanner({ name: personality.name, reason });
    timerRef.current = setTimeout(() => setBanner(null), 4200);
  }, [events.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {banner && (
        <motion.div
          key={banner.name + banner.reason}
          initial={{ opacity: 0, scaleY: 0.6 }}
          animate={{ opacity: 1, scaleY: 1 }}
          exit={{ opacity: 0, scaleY: 0.6 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 90,
            pointerEvents: "none",
            transformOrigin: "center",
          }}
        >
          {/* Full-width dark strip */}
          <div
            style={{
              background: "rgba(0,0,0,0.92)",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              padding: "26px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 18,
            }}
          >
            <span style={{ fontSize: 32 }}>💀</span>
            <span
              style={{
                color: "#ffffff",
                fontSize: 28,
                fontWeight: 900,
                letterSpacing: 1.5,
                fontFamily: "'DM Sans', system-ui, sans-serif",
                textShadow: "0 0 40px rgba(255,80,60,0.55)",
              }}
            >
              {banner.name} died due to {banner.reason}
            </span>
            <span style={{ fontSize: 32 }}>💀</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
