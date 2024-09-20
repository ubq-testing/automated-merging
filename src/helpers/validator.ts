import { Value } from "@sinclair/typebox/value";
import { envSchema, envValidator, PluginSettings, pluginSettingsSchema, pluginSettingsValidator } from "../types";

export function validateAndDecodeSchemas(env: object, rawSettings: object) {
  if (!envValidator.test(env)) {
    const errors: object[] = [];
    for (const error of envValidator.errors(env)) {
      const errorMessage = { path: error.path, message: error.message, value: error.value };
      console.error(errorMessage);
      errors.push(errorMessage);
    }
    throw new Error(`Invalid environment provided. ${errors}`);
  }

  const envDecoded = Value.Decode(envSchema, env || {});

  const settings = Value.Default(pluginSettingsSchema, rawSettings) as PluginSettings;
  if (!pluginSettingsValidator.test(settings)) {
    const errors: object[] = [];
    for (const error of pluginSettingsValidator.errors(settings)) {
      const errorMessage = { path: error.path, message: error.message, value: error.value };
      console.error(errorMessage);
      errors.push(errorMessage);
    }
    throw new Error(`Invalid settings provided. ${errors}`);
  }

  const settingsDecoded = Value.Decode(pluginSettingsSchema, settings);

  return { envDecoded, settingsDecoded };
}
