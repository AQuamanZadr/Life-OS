import { describe, expect, it } from "vitest";
import { taskSchema } from "@/features/tasks/schema";
import { fromRemote, toRemote } from "./mapping";

const task = {
  id: "3f0c5a0e-8d3b-4f43-9c53-0b1d0f5f6a11",
  title: "Задача",
  notes: "",
  status: "todo",
  priority: "medium",
  dueDate: "2026-05-10",
  projectId: null,
  goalId: null,
  createdAt: "2026-05-01T10:00:00.000Z",
  updatedAt: "2026-05-01T10:00:00.000Z",
  completedAt: null,
  deletedAt: null,
};

describe("mapping", () => {
  it("переводит ключи в snake_case для облака", () => {
    expect(toRemote(task)).toMatchObject({
      due_date: "2026-05-10",
      project_id: null,
      created_at: "2026-05-01T10:00:00.000Z",
    });
  });

  it("запись из Postgres проходит проверку схемой задачи", () => {
    const remote = {
      ...toRemote(task),
      user_id: "8a7b1c7e-1111-4222-8333-444455556666",
      created_at: "2026-05-01T13:00:00.123456+03:00",
      updated_at: "2026-05-01T10:00:00+00:00",
      server_updated_at: "2026-05-01T10:00:01.5+00:00",
    };
    const local = fromRemote(remote);
    expect(local).not.toHaveProperty("userId");
    expect(local).not.toHaveProperty("serverUpdatedAt");
    expect(local.createdAt).toBe("2026-05-01T10:00:00.123Z");
    expect(local.dueDate).toBe("2026-05-10");
    expect(taskSchema.safeParse(local).success).toBe(true);
  });
});
