const { build } = require("esbuild");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const metadata = require("./src/metadata.json");
const { execSync } = require("node:child_process");

build({
    entryPoints: ['src/extension.ts', 'src/prefs.ts'],
    outdir: 'dist',
    bundle: true,
    // Do not remove the functions `enable()`, `disable()` and `init()`
    treeShaking: false,
    // firefox60  // Since GJS 1.53.90
    // firefox68  // Since GJS 1.63.90
    // firefox78  // Since GJS 1.65.90
    // firefox91  // Since GJS 1.71.1
    // firefox102 // Since GJS 1.73.2
    target: "firefox78",
    platform: "node",
    // platform: "neutral",
    // mainFields: ['main'],
    // conditions: ['require', 'default'],
    // format: 'cjs',
    external: ['gi://*', 'system', 'gettext', 'cairo'],
}).then(() => {
    const metaSrc = path.resolve(__dirname, "src/metadata.json");
    const metaDist = path.resolve(__dirname, "dist/metadata.json");
    const zipFilename = `${metadata.uuid}.zip`;
    const zipDist = path.resolve(__dirname, zipFilename);
    fs.copyFileSync(metaSrc, metaDist);
    
    if (!fs.existsSync(path.resolve(__dirname, 'dist/schemas')))
        fs.mkdirSync(path.resolve(__dirname, 'dist/schemas'));
    const gschema = 'schemas/org.gnome.shell.extensions.autolock-keyring.gschema.xml';
    fs.copyFileSync(path.resolve(__dirname, `src/${gschema}`), path.resolve(__dirname, `dist/${gschema}`));
    execSync('glib-compile-schemas --targetdir=dist/schemas/ src/schemas/');

    const zip = new AdmZip();
    zip.addLocalFolder(path.resolve(__dirname, "dist"));
    zip.writeZip(zipDist);

    console.log(`Build complete. Zip file: ${zipFilename}\n`);
    console.log(`Install with: gnome-extensions install ${zipFilename}`)
    console.log(`Update with: gnome-extensions install ${zipFilename} --force`)
    console.log(`Enable with: gnome-extensions enable ${metadata.uuid}`)
});
