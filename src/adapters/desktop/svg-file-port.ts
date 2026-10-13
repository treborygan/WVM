import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

import type { SvgFilePort } from "../../application/export-template-svg";

export const desktopSvgFilePort: SvgFilePort = {
  chooseDestination: (suggestedFileName) => save({
    title: "Export artwork as SVG",
    defaultPath: suggestedFileName,
    filters: [{ name: "SVG artwork", extensions: ["svg"] }],
  }),
  writeText: (path, contents) => writeTextFile(path, contents),
};
