const { MakerZIP } = require("@electron-forge/maker-zip");
const { AutoUnpackNativesPlugin } = require("@electron-forge/plugin-auto-unpack-natives");
const { FusesPlugin } = require("@electron-forge/plugin-fuses");
const { FuseV1Options, FuseVersion } = require("@electron/fuses");

const config = {
    packagerConfig: {
        asar: true,
        icon: "src/icon.png"
    },
    rebuildConfig: {},
    makers: [
        new MakerZIP({icon: "src/icon.png"}, ["win32"])
    ],
    plugins: [
        new AutoUnpackNativesPlugin({}),
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
        }),
    ],
};

module.exports = config;