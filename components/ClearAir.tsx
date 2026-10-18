"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { startClearAir } from "@/lib/clear-air-app";

// The app sets global timers and listeners, so start it once per page load (React Strict Mode runs effects twice in dev).
let started = false;

export default function ClearAir() {
  useEffect(() => {
    if (started) return;
    started = true;
    startClearAir(createClient());
  }, []);

  return (
    <div className="wrap" id="app">
      <header>
        <div className="brand">
          <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
            <circle cx="15" cy="15" r="14" fill="var(--air)" />
            <path d="M8 18c3-4 6 2 9-2s4-5 6-3" stroke="var(--surface)" strokeWidth="2.4" fill="none" strokeLinecap="round" />
          </svg>
          <h1>Clear Air</h1>
        </div>
      </header>
      <p className="empty">Opening your streak…</p>
    </div>
  );
}
