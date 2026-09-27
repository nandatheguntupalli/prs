#!/usr/bin/env bash
# Prints the Homebrew formula for a release: scripts/formula.sh <version> <checksums.txt>
set -euo pipefail
version="$1"
sums="$2"
base="https://github.com/nandatheguntupalli/prs/releases/download/v${version}"
sha() { awk -v f="prs-$1.tar.gz" '$2 == f { print $1 }' "$sums"; }

cat <<RUBY
class Prs < Formula
  desc "Superhuman for pull requests: a keyboard-first TUI for reviewing and merging PRs"
  homepage "https://github.com/nandatheguntupalli/prs"
  version "${version}"
  license "MIT"

  depends_on "gh"

  on_macos do
    on_arm do
      url "${base}/prs-darwin-arm64.tar.gz"
      sha256 "$(sha darwin-arm64)"
    end
    on_intel do
      url "${base}/prs-darwin-x64.tar.gz"
      sha256 "$(sha darwin-x64)"
    end
  end

  on_linux do
    on_arm do
      url "${base}/prs-linux-arm64.tar.gz"
      sha256 "$(sha linux-arm64)"
    end
    on_intel do
      url "${base}/prs-linux-x64.tar.gz"
      sha256 "$(sha linux-x64)"
    end
  end

  def install
    bin.install "prs"
  end

  test do
    assert_equal version.to_s, shell_output("#{bin}/prs --version").strip
  end
end
RUBY
