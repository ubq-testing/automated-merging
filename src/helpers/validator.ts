import { Value } from "@sinclair/typebox/value";
import { envSchema, envValidator, PluginSettings, pluginSettingsSchema, pluginSettingsValidator } from "../types";

export function validateAndDecodeSchemas(env: object, rawSettings: object) {
  const errors: object[] = [];
  if (!envValidator.test(env)) {
    for (const error of envValidator.errors(env)) {
      const errorMessage = { path: error.path, message: error.message, value: error.value };
      console.error(errorMessage);
      errors.push(errorMessage);
    }
  }
  const envDecoded = Value.Decode(envSchema, env || {});

  const settings = Value.Default(pluginSettingsSchema, rawSettings) as PluginSettings;
  if (!pluginSettingsValidator.test(settings)) {
    for (const error of pluginSettingsValidator.errors(settings)) {
      const errorMessage = { path: error.path, message: error.message, value: error.value };
      console.error(errorMessage);
      errors.push(errorMessage);
    }
  }

  const settingsDecoded = Value.Decode(pluginSettingsSchema, settings);

  return { envDecoded, settingsDecoded, errors };
}
