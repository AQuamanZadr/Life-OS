"use client";

import { useRows } from "@/lib/use-rows";
import type { Task } from "./schema";

export const useTasks = () => useRows<Task>("tasks");
