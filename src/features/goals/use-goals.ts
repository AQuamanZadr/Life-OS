"use client";

import { useRows } from "@/lib/use-rows";
import type { Goal } from "./schema";

export const useGoals = () => useRows<Goal>("goals");
