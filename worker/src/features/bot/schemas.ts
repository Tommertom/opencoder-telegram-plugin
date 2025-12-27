import { z } from "zod";

export const telegramUpdateSchema = z.object({
  message: z
    .object({
      chat: z.object({
        id: z.number(),
      }),
      text: z.string().optional(),
      from: z
        .object({
          first_name: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});
