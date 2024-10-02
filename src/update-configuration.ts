import * as fs from "node:fs";
import { pluginSettingsSchema } from "./types";
import manifest from "../manifest.json";

const configuration = JSON.stringify(pluginSettingsSchema);
console.log(configuration);
// @ts-expect-error The manifest doesn't necessarily already have the configuration key
manifest["configuration"] = JSON.parse(configuration);
fs.writeFileSync("./manifest.json", JSON.stringify(manifest, null, 2));
