{
  description = "SlimeTora NixOS development environment";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
    in
    {
      devShells = nixpkgs.lib.genAttrs systems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };

          python = pkgs.python311.withPackages (ps: [
            ps.setuptools
          ]);

          fhs = pkgs.buildFHSEnv {
            name = "slimetora-dev";

            targetPkgs =
              p: with p; [
                nodejs_24
                pnpm

                python
                stdenv.cc
                gnumake
                pkg-config

                bluez
                udev
                libusb1

                glib
                gtk3
                cairo
                pango
                expat
                nss
                nspr
                dbus
                cups
                alsa-lib
                at-spi2-atk
                libgbm
                libxkbcommon

                libGL
                libglvnd
                libdrm

                libX11
                libxcb
                libXcomposite
                libXdamage
                libXext
                libXfixes
                libXrandr

                xdg-utils
              ];

            profile = ''
              export PYTHON="${python}/bin/python3"
              export npm_config_python="$PYTHON"
            '';

            runScript = "bash";
          };

        in
        {
          default = fhs.env;
        }
      );
    };
}
