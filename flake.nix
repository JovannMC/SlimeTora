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
              fhsPkgs:
              (with fhsPkgs; [
                nodejs_24
                pnpm

                python

                stdenv.cc
                stdenv.cc.cc.lib
                gnumake
                pkg-config

                bluez
                udev
                libusb1

                alsa-lib
                at-spi2-atk
                cairo
                cups
                dbus
                expat
                gdk-pixbuf
                glib
                gtk3
                gtk4
                nspr
                nss
                pango
                pciutils
                systemd
                libnotify
                pipewire
                libsecret
                libpulseaudio
                speechd-minimal
                libdrm
                libgbm
                libxkbcommon
                libxshmfence
                libxkbfile
                libGL
                vulkan-loader
                mesa

                gsettings-desktop-schemas
                hicolor-icon-theme
                xdg-utils

                libX11
                libxcb
                libXcomposite
                libXdamage
                libXext
                libXfixes
                libXrandr
              ]);

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
