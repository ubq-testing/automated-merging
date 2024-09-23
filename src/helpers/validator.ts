import { Value, ValueError } from "@sinclair/typebox/value";
import { envSchema, envValidator, PluginSettings, pluginSettingsSchema, pluginSettingsValidator } from "../types";

export function validateAndDecodeSchemas(env: object, rawSettings: object) {
  const errors: ValueError[] = [];
  if (!envValidator.test(env)) {
    for (const error of envValidator.errors(env)) {
      console.error(error);
      errors.push(error);
    }
  }

  const settings = Value.Default(pluginSettingsSchema, rawSettings) as PluginSettings;
  if (!pluginSettingsValidator.test(settings)) {
    for (const error of pluginSettingsValidator.errors(settings)) {
      console.error(error);
      errors.push(error);
    }
  }

  const settingsDecoded = Value.Decode(pluginSettingsSchema, settings);
  const envDecoded = Value.Decode(envSchema, env || {});

  return { envDecoded, settingsDecoded, errors };
}
