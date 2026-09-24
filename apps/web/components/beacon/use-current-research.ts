"use client";

import { useEffect, useState } from "react";
import {
  ACTIVE_VERSION_KEY,
  VERSION_STORAGE_KEY,
  VERSION_UPDATED_EVENT,
  readActiveVersionId,
  readStoredVersions,
  type ResearchVersion,
} from "@/lib/research-versions";

export type CurrentResearchState =
  | { kind: "loading" }
  | { kind: "unreadable" }
  | { kind: "empty" }
  | { kind: "ready"; version: ResearchVersion };

function readCurrent(): CurrentResearchState {
  const raw = window.localStorage.getItem(VERSION_STORAGE_KEY);
  if (raw !== null) {
    try {
      if (!Array.isArray(JSON.parse(raw))) return { kind: "unreadable" };
    } catch {
      return { kind: "unreadable" };
    }
  }
  const versions = readStoredVersions("research");
  if (raw !== null && JSON.parse(raw).length !== versions.length) return { kind: "unreadable" };
  const id = readActiveVersionId(versions, "research");
  const version = versions.find((entry) => entry.versionId === id);
  return version ? { kind: "ready", version } : { kind: "empty" };
}

export function useCurrentResearch(): CurrentResearchState {
  const [current, setCurrent] = useState<CurrentResearchState>({ kind: "loading" });

  useEffect(() => {
    const sync = () => {
      try { setCurrent(readCurrent()); } catch { setCurrent({ kind: "unreadable" }); }
    };
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === VERSION_STORAGE_KEY || event.key === ACTIVE_VERSION_KEY) sync();
    };
    window.addEventListener(VERSION_UPDATED_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(VERSION_UPDATED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return current;
}
