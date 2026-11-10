"use client";

import { useRows } from "@/lib/use-rows";
import type { Project } from "./schema";

export const useProjects = () => useRows<Project>("projects");
