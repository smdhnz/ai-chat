"use client";

import { useEffect, useState } from "react";
import { getBootstrap, type Bootstrap } from "@/lib/api";

export function useBootstrap() {
  const [data, setData] = useState<Bootstrap | null>(null);
  useEffect(() => {
    void getBootstrap().then(setData);
  }, []);
  return [data, setData] as const;
}
