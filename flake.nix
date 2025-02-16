{
  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    rainix.url = "github:rainprotocol/rainix";
  };

  outputs = { self, flake-utils, rainix }:

  flake-utils.lib.eachDefaultSystem (system:
    let
      pkgs = rainix.pkgs.${system};
    in rec {
      packages = rec {
        install-deps = rainix.mkTask.${system} {
          name = "install-deps";
          body = ''
            set -euxo pipefail
            npm install --legacy-deps
          '';
        };
      };

      # For `nix develop`:
      devShells.default = pkgs.mkShell {
        packages = [
          packages.install-deps
        ];
        nativeBuildInputs = [
          rainix.node-build-inputs.${system}
          pkgs.yarn
        ];
      };
    }
  );
}