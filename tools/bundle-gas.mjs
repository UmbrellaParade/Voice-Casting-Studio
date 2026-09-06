import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function bundleGasSource() {
  const read = (name) => readFileSync(resolve(root, "docs/google-apps-script", name), "utf8");
  let audition = read("AuditionForms.gs").replace("function doPost(event)", "function vcsUnusedStandaloneAuditionPost_(event)")
    .replace("function vcsExpectedAuditionItems_()", "function vcsLegacyExpectedAuditionItems_()");
  audition = audition.replace('const VCS_AUDITION_AUDIOBOOK_NOTICE = [', 'const VCS_AUDITION_AUDIOBOOK_NOTICE = !VCS_AUDITION_AUDIOBOOK_URL ? "" : [');
  for (const [constant, key] of [["TEMPLATE_FORM_ID", "templateFormId"], ["FORMS_FOLDER_ID", "formsFolderId"], ["IMAGE_FOLDER_ID", "imageFolderId"], ["AUDIOBOOK_URL", "audiobookUrl"]]) {
    const expression = new RegExp(`const VCS_AUDITION_${constant} = [^;]+;`);
    if (!expression.test(audition)) throw new Error(`Missing GAS configuration constant: ${constant}`);
    audition = audition.replace(expression, `const VCS_AUDITION_${constant} = vcsOwnerIntegrationValue_("${key}");`);
  }
  return [read("Code.gs"), read("OwnerBackend.gs"), read("OwnerAudition.gs"), audition,
    "function vcsExpectedAuditionItems_() { return vcsOwnerExpectedAuditionItems_(); }"].join("\n\n");
}
export function writeGasBundle(destination) {
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, bundleGasSource());
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = resolve(root, "artifacts/paired-build/gas-backend/Code.gs");
  writeGasBundle(destination);
  console.log(`GAS bundle: ${destination}`);
}
