import { z } from "zod";

export const notifyRequestSchema = z.object({
  key: z.string().min(1, "Missing key"),
  project: z.string().optional(),
  sessionTitle: z.string().optional(),
  message: z.string().optional(),
});
