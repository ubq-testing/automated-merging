import { Type as T } from "@sinclair/typebox";
import { StaticDecode } from "@sinclair/typebox";
import "dotenv/config";

export const envSchema = T.Object({
  workflowName: T.String(),
});

export type Env = StaticDecode<typeof envSchema>;
