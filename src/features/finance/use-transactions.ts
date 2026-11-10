"use client";

import { useRows } from "@/lib/use-rows";
import type { Transaction } from "./schema";

export const useTransactions = () => useRows<Transaction>("transactions");
