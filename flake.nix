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
      # For `nix develop`:
      devShells.default = pkgs.mkShell {
        nativeBuildInputs = [
          rainix.node-build-inputs.${system}
          pkgs.yarn
        ];
      };
    }
  );
}
